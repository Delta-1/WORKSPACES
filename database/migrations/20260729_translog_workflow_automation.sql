begin;

-- TransLog: previsibilidade, automações idempotentes e acesso documental.
alter table public.logistics_cargas
  add column if not exists purchase_amount numeric(18,2),
  add column if not exists warehouse_location text,
  add column if not exists nota_entrada text,
  add column if not exists priority text not null default 'normal',
  add column if not exists operation_status text not null default 'active',
  add column if not exists stage_started_at timestamptz not null default now(),
  add column if not exists stage_due_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.logistics_stock
  add column if not exists carga_id uuid,
  add column if not exists automation_key text;

alter table public.logistics_finance
  add column if not exists automation_key text,
  add column if not exists due_date date,
  add column if not exists paid_at timestamptz,
  add column if not exists notes text;

alter table public.logistics_documents
  add column if not exists status text not null default 'emitido',
  add column if not exists due_at timestamptz,
  add column if not exists storage_path text;

alter table public.company_settings
  add column if not exists logistics_server_agent_id uuid;

create unique index if not exists logistics_finance_automation_key_uq
  on public.logistics_finance(company_id, automation_key);
create unique index if not exists logistics_stock_automation_key_uq
  on public.logistics_stock(company_id, automation_key);

create table if not exists public.logistics_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  carga_id uuid not null,
  event_type text not null,
  title text not null,
  description text,
  stage text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists logistics_events_company_carga_idx
  on public.logistics_events(company_id, carga_id, created_at desc);

create table if not exists public.logistics_work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  carga_id uuid not null,
  numero text not null,
  kind text not null default 'operacao_exportacao',
  status text not null default 'aberta',
  form_data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, carga_id, kind)
);

create table if not exists public.logistics_folder_access (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  folder_id uuid not null,
  profile_id uuid not null,
  can_view boolean not null default true,
  can_write boolean not null default false,
  granted_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, folder_id, profile_id)
);

create or replace function public.is_active_company_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.companies c
     where c.id = public.active_company_id()
       and c.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_active_company_owner() from public;
grant execute on function public.is_active_company_owner() to authenticated;

alter table public.logistics_events enable row level security;
alter table public.logistics_work_orders enable row level security;
alter table public.logistics_folder_access enable row level security;

drop policy if exists logistics_events_company_select on public.logistics_events;
drop policy if exists logistics_events_company_insert on public.logistics_events;
create policy logistics_events_company_select
  on public.logistics_events for select to authenticated
  using (company_id = public.active_company_id());
create policy logistics_events_company_insert
  on public.logistics_events for insert to authenticated
  with check (company_id = public.active_company_id() and created_by = auth.uid());

drop policy if exists logistics_work_orders_company_select on public.logistics_work_orders;
drop policy if exists logistics_work_orders_company_write on public.logistics_work_orders;
create policy logistics_work_orders_company_select
  on public.logistics_work_orders for select to authenticated
  using (company_id = public.active_company_id());
create policy logistics_work_orders_company_write
  on public.logistics_work_orders for all to authenticated
  using (company_id = public.active_company_id())
  with check (company_id = public.active_company_id());

drop policy if exists logistics_folder_access_company_select on public.logistics_folder_access;
drop policy if exists logistics_folder_access_owner_insert on public.logistics_folder_access;
drop policy if exists logistics_folder_access_owner_update on public.logistics_folder_access;
drop policy if exists logistics_folder_access_owner_delete on public.logistics_folder_access;
create policy logistics_folder_access_company_select
  on public.logistics_folder_access for select to authenticated
  using (company_id = public.active_company_id());
create policy logistics_folder_access_owner_insert
  on public.logistics_folder_access for insert to authenticated
  with check (company_id = public.active_company_id() and public.is_active_company_owner());
create policy logistics_folder_access_owner_update
  on public.logistics_folder_access for update to authenticated
  using (company_id = public.active_company_id() and public.is_active_company_owner())
  with check (company_id = public.active_company_id() and public.is_active_company_owner());
create policy logistics_folder_access_owner_delete
  on public.logistics_folder_access for delete to authenticated
  using (company_id = public.active_company_id() and public.is_active_company_owner());

-- Política restritiva: documentos de uma operação só aparecem para o fundador
-- ou para quem recebeu acesso explícito à pasta daquela operação.
drop policy if exists logistics_documents_folder_scope on public.logistics_documents;
create policy logistics_documents_folder_scope
  on public.logistics_documents
  as restrictive
  for select
  to authenticated
  using (
    company_id = public.active_company_id()
    and (
      public.is_active_company_owner()
      or exists (
        select 1
          from public.logistics_cargas c
          join public.logistics_folder_access a
            on a.company_id = c.company_id
           and a.folder_id = c.folder_id
         where c.id = logistics_documents.carga_id
           and a.profile_id = auth.uid()
           and a.can_view
      )
    )
  );

-- Uma movimentação de etapa é uma única transação. Além de mover a carreta,
-- cria os registros obrigatórios sem duplicá-los caso alguém clique novamente.
create or replace function public.logistics_move_carga(
  p_carga_id uuid,
  p_next_stage text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_company_id uuid := public.active_company_id();
  v_carga public.logistics_cargas%rowtype;
  v_due timestamptz;
  v_quantity numeric;
  v_unit text;
  v_code text;
begin
  if p_next_stage not in (
    'proforma', 'pedido', 'entrada', 'fumigacao', 'documentacao',
    'transbordo', 'exportacao', 'em_transito', 'concluido'
  ) then
    raise exception 'Etapa inválida';
  end if;

  select *
    into v_carga
    from public.logistics_cargas
   where id = p_carga_id
     and company_id = v_company_id
   for update;

  if not found then
    raise exception 'Operação não encontrada neste ambiente';
  end if;

  v_due := case p_next_stage
    when 'proforma' then now() + interval '72 hours'
    when 'pedido' then now() + interval '48 hours'
    when 'entrada' then now() + interval '24 hours'
    when 'fumigacao' then now() + interval '48 hours'
    when 'documentacao' then now() + interval '48 hours'
    when 'transbordo' then now() + interval '24 hours'
    when 'exportacao' then now() + interval '48 hours'
    when 'em_transito' then now() + interval '120 hours'
    else null
  end;

  update public.logistics_cargas
     set stage = p_next_stage,
         stage_started_at = now(),
         stage_due_at = v_due,
         operation_status = case when p_next_stage = 'concluido' then 'completed' else 'active' end,
         updated_at = now()
   where id = p_carga_id;

  insert into public.logistics_events (
    company_id, carga_id, event_type, title, description, stage, created_by
  ) values (
    v_company_id,
    p_carga_id,
    'stage_changed',
    'Etapa alterada para ' || p_next_stage,
    p_notes,
    p_next_stage,
    auth.uid()
  );

  if p_next_stage = 'pedido' then
    insert into public.logistics_finance (
      company_id, escopo, tipo, categoria, descricao, valor, carga_id,
      status, due_date, automation_key
    ) values (
      v_company_id, 'operacao', 'despesa', 'Pedido de Compra',
      'Pedido de compra da operação ' || coalesce(v_carga.codigo, p_carga_id::text),
      coalesce(v_carga.purchase_amount, 0), p_carga_id,
      'aberto', current_date + 2, 'purchase-order:' || p_carga_id
    )
    on conflict (company_id, automation_key) do update
      set valor = excluded.valor,
          descricao = excluded.descricao,
          due_date = excluded.due_date;
  end if;

  if p_next_stage = 'entrada' then
    v_quantity := coalesce(nullif(v_carga.peso, 0), nullif(v_carga.volumes, 0), 0);
    v_unit := case when coalesce(v_carga.peso, 0) > 0 then 'kg' else 'vol' end;

    insert into public.logistics_stock (
      company_id, carga_id, produto, lote, quantidade, unidade,
      local_armazenamento, status, automation_key
    ) values (
      v_company_id, p_carga_id, coalesce(v_carga.produto, 'Carga sem produto'),
      coalesce(v_carga.nota_entrada, v_carga.codigo),
      v_quantity, v_unit, coalesce(v_carga.warehouse_location, 'A definir'),
      'disponivel', 'stock-entry:' || p_carga_id
    )
    on conflict (company_id, automation_key) do update
      set quantidade = greatest(public.logistics_stock.quantidade, excluded.quantidade),
          local_armazenamento = excluded.local_armazenamento;

    v_code := 'OS-' || regexp_replace(coalesce(v_carga.codigo, right(p_carga_id::text, 6)), '[^0-9A-Za-z]', '', 'g');
    insert into public.logistics_work_orders (
      company_id, carga_id, numero, kind, status, form_data
    ) values (
      v_company_id, p_carga_id, v_code, 'operacao_exportacao', 'aberta',
      jsonb_build_object(
        'cliente', v_carga.cliente_nome,
        'produto', v_carga.produto,
        'origem', v_carga.origem,
        'destino', v_carga.destino,
        'cfop', v_carga.cfop,
        'nota_entrada', v_carga.nota_entrada
      )
    )
    on conflict (company_id, carga_id, kind) do update
      set form_data = excluded.form_data,
          updated_at = now();
  end if;

  if p_next_stage = 'transbordo' then
    insert into public.logistics_events (
      company_id, carga_id, event_type, title, description, stage, created_by,
      metadata
    ) values (
      v_company_id, p_carga_id, 'transshipment',
      'Transbordo registrado sem nova fatura',
      coalesce(p_notes, v_carga.transbordo_local),
      p_next_stage, auth.uid(),
      jsonb_build_object('invoice_created', false)
    );
  end if;

  if p_next_stage = 'exportacao' then
    insert into public.logistics_finance (
      company_id, escopo, tipo, categoria, descricao, valor, carga_id,
      status, due_date, automation_key
    ) values (
      v_company_id, 'operacao', 'receita', 'Invoice / Frete',
      'Faturamento da operação ' || coalesce(v_carga.codigo, p_carga_id::text),
      coalesce(v_carga.valor_declarado, 0), p_carga_id,
      'aberto', current_date + 7, 'invoice-receivable:' || p_carga_id
    )
    on conflict (company_id, automation_key) do update
      set valor = excluded.valor,
          descricao = excluded.descricao,
          due_date = excluded.due_date;
  end if;

  return jsonb_build_object(
    'id', p_carga_id,
    'stage', p_next_stage,
    'stage_due_at', v_due
  );
end;
$$;

revoke all on function public.logistics_move_carga(uuid, text, text) from public;
grant execute on function public.logistics_move_carga(uuid, text, text) to authenticated;

commit;
