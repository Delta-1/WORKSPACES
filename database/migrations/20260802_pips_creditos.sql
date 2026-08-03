begin;

-- ============================================================================
-- PIPS — créditos pré-pagos que os contatos gastam com os serviços da Nina.
--
-- Regra de ouro: a IA NUNCA calcula saldo. Ela só pergunta ("quanto tem?") e
-- pede ("debita 100"). Toda a aritmética acontece aqui dentro, numa única
-- instrução atômica — é isso que impede a Nina de errar o saldo de alguém.
-- ============================================================================

-- Saldo atual. Uma linha por contato; o CHECK torna saldo negativo impossível
-- no nível do banco, não da aplicação.
create table if not exists public.contact_credits (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  company_id uuid,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- Extrato: toda entrada e saída vira uma linha aqui, para sempre. É o que
-- permite auditar "por que meu saldo está assim" sem depender de memória da IA.
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid,
  delta integer not null,             -- positivo = compra/bônus, negativo = consumo
  balance_after integer not null,
  reason text not null,               -- compra | monografia | apresentacao | ajuste | bonus
  detail text,
  ref text,                           -- id do pagamento no Mercado Pago (quando compra)
  created_at timestamptz not null default now()
);

create index if not exists credit_tx_contact_idx on public.credit_transactions (contact_id, created_at desc);

-- IDEMPOTÊNCIA: o Mercado Pago reenvia o webhook até receber 200. Sem isto, o
-- mesmo pagamento creditaria pips várias vezes.
create unique index if not exists credit_tx_ref_uniq
  on public.credit_transactions (ref) where ref is not null;

-- ── funções ─────────────────────────────────────────────────────────────────

create or replace function public.credits_balance(p_contact uuid)
returns integer
language sql
security definer
set search_path to 'public'
as $$
  select coalesce((select balance from public.contact_credits where contact_id = p_contact), 0);
$$;

-- Crédito (compra aprovada, bônus, ajuste). `p_ref` torna a operação idempotente:
-- chamar duas vezes com o mesmo pagamento não credita em dobro.
create or replace function public.credits_add(
  p_contact uuid, p_company uuid, p_pips integer,
  p_reason text default 'compra', p_detail text default null, p_ref text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_balance integer;
begin
  if p_pips is null or p_pips <= 0 then
    raise exception 'quantidade de pips deve ser positiva';
  end if;

  -- Já creditado antes (webhook repetido) → devolve o saldo sem mexer em nada.
  if p_ref is not null and exists (select 1 from public.credit_transactions where ref = p_ref) then
    return public.credits_balance(p_contact);
  end if;

  insert into public.contact_credits (contact_id, company_id, balance)
  values (p_contact, p_company, p_pips)
  on conflict (contact_id) do update
    set balance = public.contact_credits.balance + p_pips,
        company_id = coalesce(public.contact_credits.company_id, excluded.company_id),
        updated_at = now()
  returning balance into v_balance;

  insert into public.credit_transactions (contact_id, company_id, delta, balance_after, reason, detail, ref)
  values (p_contact, p_company, p_pips, v_balance, coalesce(p_reason, 'compra'), p_detail, p_ref);

  return v_balance;
end;
$$;

-- Débito de um serviço. O UPDATE só acerta a linha se houver saldo suficiente —
-- se não houver, nada muda e a função avisa quanto falta.
create or replace function public.credits_debit(
  p_contact uuid, p_company uuid, p_pips integer,
  p_reason text default 'servico', p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_balance integer;
  v_atual integer;
begin
  if p_pips is null or p_pips <= 0 then
    raise exception 'quantidade de pips deve ser positiva';
  end if;

  update public.contact_credits
     set balance = balance - p_pips, updated_at = now()
   where contact_id = p_contact and balance >= p_pips
  returning balance into v_balance;

  if v_balance is null then
    v_atual := public.credits_balance(p_contact);
    return jsonb_build_object(
      'ok', false, 'saldo', v_atual, 'faltam', p_pips - v_atual,
      'mensagem', format('Saldo insuficiente: tem %s pips e precisa de %s.', v_atual, p_pips)
    );
  end if;

  insert into public.credit_transactions (contact_id, company_id, delta, balance_after, reason, detail)
  values (p_contact, p_company, -p_pips, v_balance, coalesce(p_reason, 'servico'), p_detail);

  return jsonb_build_object('ok', true, 'saldo', v_balance, 'debitado', p_pips);
end;
$$;

-- Extrato recente, para a pessoa conferir de onde veio e para onde foi.
create or replace function public.credits_extrato(p_contact uuid, p_limit integer default 10)
returns table (quando timestamptz, delta integer, saldo integer, motivo text, detalhe text)
language sql
security definer
set search_path to 'public'
as $$
  select created_at, delta, balance_after, reason, detail
  from public.credit_transactions
  where contact_id = p_contact
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- ── permissões ──────────────────────────────────────────────────────────────
-- Só o serviço (service_role) movimenta saldo. O app autenticado pode LER o
-- saldo e o extrato dos contatos do próprio ambiente.
revoke all on function public.credits_add(uuid, uuid, integer, text, text, text) from public;
revoke all on function public.credits_debit(uuid, uuid, integer, text, text) from public;
grant execute on function public.credits_add(uuid, uuid, integer, text, text, text) to service_role;
grant execute on function public.credits_debit(uuid, uuid, integer, text, text) to service_role;

revoke all on function public.credits_balance(uuid) from public;
revoke all on function public.credits_extrato(uuid, integer) from public;
grant execute on function public.credits_balance(uuid) to authenticated, service_role;
grant execute on function public.credits_extrato(uuid, integer) to authenticated, service_role;

alter table public.contact_credits enable row level security;
alter table public.credit_transactions enable row level security;

drop policy if exists environment_isolation on public.contact_credits;
create policy environment_isolation on public.contact_credits
  as restrictive for all to authenticated
  using (company_id = public.active_company_id())
  with check (company_id = public.active_company_id());

drop policy if exists environment_isolation on public.credit_transactions;
create policy environment_isolation on public.credit_transactions
  as restrictive for all to authenticated
  using (company_id = public.active_company_id())
  with check (company_id = public.active_company_id());

-- ============================================================================
-- Token de pagamento POR AGENTE.
--
-- Hoje fica vazio e tudo cai no MERCADOPAGO_ACCESS_TOKEN da plataforma (a
-- conta do dono). Quando as empresas puderem vender por conta própria, basta
-- preencher aqui — sem mexer no código.
-- ============================================================================
alter table public.chatbots
  add column if not exists mercadopago_token text;

commit;
