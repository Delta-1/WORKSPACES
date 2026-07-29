begin;

-- O ambiente ativo é o company_id do perfil autenticado. Uma Casa também é um
-- ambiente, portanto esta mesma regra separa Casa, Empresa e demais workspaces.
create or replace function public.active_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.company_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

revoke all on function public.active_company_id() from public;
grant execute on function public.active_company_id() to authenticated;

-- Estas políticas são RESTRITIVAS: mesmo que uma policy antiga esteja aberta,
-- os dados internos abaixo precisam pertencer ao ambiente ativo.
do $$
declare
  scoped_table text;
begin
  foreach scoped_table in array array[
    'agent_jobs',
    'sectors',
    'tasks',
    'events',
    'announcements',
    'files',
    'contact_groups',
    'conversations',
    'whatsapp_numbers',
    'whatsapp_messages',
    'chatbots',
    'clients',
    'attendance',
    'finance_entries',
    'forms',
    'form_responses',
    'automation',
    'automation_routines',
    'automation_runs',
    'billing_charges',
    'billing_targets',
    'company_settings',
    'remote_agents',
    'server_transfers',
    'studio_documents',
    'third_parties',
    'logistics_cargas',
    'logistics_documents',
    'logistics_driver_messages',
    'logistics_drivers',
    'logistics_finance',
    'logistics_fumigations',
    'logistics_pod',
    'logistics_stock',
    'logistics_vehicle_expenses',
    'logistics_vehicles'
  ]
  loop
    if to_regclass('public.' || scoped_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and information_schema.columns.table_name = scoped_table
           and column_name = 'company_id'
       ) then
      execute format('alter table public.%I enable row level security', scoped_table);
      execute format('drop policy if exists environment_isolation on public.%I', scoped_table);
      execute format(
        'create policy environment_isolation on public.%I as restrictive for all to authenticated using (company_id = public.active_company_id()) with check (company_id = public.active_company_id())',
        scoped_table
      );
    end if;
  end loop;
end
$$;

-- Um perfil autenticado só enxerga a si mesmo e as pessoas do ambiente ativo.
-- A policy é apenas de leitura para não interferir nos RPCs de troca de ambiente.
drop policy if exists profiles_environment_select on public.profiles;
create policy profiles_environment_select
  on public.profiles
  as restrictive
  for select
  to authenticated
  using (id = auth.uid() or company_id = public.active_company_id());

-- Ligações do grafo não possuem company_id: os dois arquivos precisam estar no
-- ambiente ativo para a ligação poder ser lida ou alterada.
do $$
begin
  if to_regclass('public.file_links') is not null then
    drop policy if exists environment_isolation on public.file_links;
    create policy environment_isolation
      on public.file_links
      as restrictive
      for all
      to authenticated
      using (
        exists (
          select 1 from public.files source_file
          where source_file.id = source_id
            and source_file.company_id = public.active_company_id()
        )
        and exists (
          select 1 from public.files target_file
          where target_file.id = target_id
            and target_file.company_id = public.active_company_id()
        )
      )
      with check (
        exists (
          select 1 from public.files source_file
          where source_file.id = source_id
            and source_file.company_id = public.active_company_id()
        )
        and exists (
          select 1 from public.files target_file
          where target_file.id = target_id
            and target_file.company_id = public.active_company_id()
        )
      );
  end if;
end
$$;

-- Conclusão de tarefa do Group é pessoal. A agenda continua compartilhada, mas
-- cada membro marca seu próprio estado sem concluir a tarefa dos outros.
create table if not exists public.group_agenda_completion (
  agenda_id uuid not null references public.group_agenda(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (agenda_id, user_id)
);

alter table public.group_agenda_completion enable row level security;

create or replace function public.workspace_is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
  )
$$;

revoke all on function public.workspace_is_group_member(uuid, uuid) from public;
grant execute on function public.workspace_is_group_member(uuid, uuid) to authenticated;

drop policy if exists group_agenda_completion_select on public.group_agenda_completion;
drop policy if exists group_agenda_completion_insert on public.group_agenda_completion;
drop policy if exists group_agenda_completion_update on public.group_agenda_completion;
drop policy if exists group_agenda_completion_delete on public.group_agenda_completion;

create policy group_agenda_completion_select
  on public.group_agenda_completion
  for select to authenticated
  using (user_id = auth.uid());

create policy group_agenda_completion_insert
  on public.group_agenda_completion
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.group_agenda ga
      where ga.id = agenda_id
        and public.workspace_is_group_member(ga.group_id)
    )
  );

create policy group_agenda_completion_update
  on public.group_agenda_completion
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.group_agenda ga
      where ga.id = agenda_id
        and public.workspace_is_group_member(ga.group_id)
    )
  );

create policy group_agenda_completion_delete
  on public.group_agenda_completion
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.group_agenda_completion to authenticated;

-- O Group não pertence à empresa ativa; ele pertence somente aos usuários que
-- entraram nele. Substituímos policies abertas por regras de participação.
do $$
declare
  policy_row record;
  group_table text;
begin
  foreach group_table in array array[
    'groups',
    'group_members',
    'group_posts',
    'group_agenda',
    'group_leader_votes'
  ]
  loop
    if to_regclass('public.' || group_table) is not null then
      for policy_row in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = group_table
      loop
        execute format('drop policy %I on public.%I', policy_row.policyname, group_table);
      end loop;
      execute format('alter table public.%I enable row level security', group_table);
    end if;
  end loop;
end
$$;

create policy groups_member_select
  on public.groups for select to authenticated
  using (created_by = auth.uid() or public.workspace_is_group_member(id));
create policy groups_creator_insert
  on public.groups for insert to authenticated
  with check (created_by = auth.uid());
create policy groups_leader_update
  on public.groups for update to authenticated
  using (created_by = auth.uid() or leader_id = auth.uid())
  with check (created_by = auth.uid() or leader_id = auth.uid());
create policy groups_creator_delete
  on public.groups for delete to authenticated
  using (created_by = auth.uid());

create policy group_members_member_select
  on public.group_members for select to authenticated
  using (public.workspace_is_group_member(group_id));
-- Entradas passam exclusivamente pelo RPC join_group, que valida o código.
create policy group_members_self_or_leader_delete
  on public.group_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id
        and (g.created_by = auth.uid() or g.leader_id = auth.uid())
    )
  );

create policy group_posts_member_select
  on public.group_posts for select to authenticated
  using (public.workspace_is_group_member(group_id));
create policy group_posts_member_insert
  on public.group_posts for insert to authenticated
  with check (user_id = auth.uid() and public.workspace_is_group_member(group_id));
create policy group_posts_author_update
  on public.group_posts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.workspace_is_group_member(group_id));
create policy group_posts_author_delete
  on public.group_posts for delete to authenticated
  using (user_id = auth.uid());

create policy group_agenda_member_select
  on public.group_agenda for select to authenticated
  using (public.workspace_is_group_member(group_id));
create policy group_agenda_leader_insert
  on public.group_agenda for insert to authenticated
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_id
        and (g.created_by = auth.uid() or g.leader_id = auth.uid())
    )
  );
create policy group_agenda_leader_update
  on public.group_agenda for update to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_id
        and (g.created_by = auth.uid() or g.leader_id = auth.uid())
    )
  );
create policy group_agenda_leader_delete
  on public.group_agenda for delete to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_id
        and (g.created_by = auth.uid() or g.leader_id = auth.uid())
    )
  );

create policy group_votes_member_select
  on public.group_leader_votes for select to authenticated
  using (public.workspace_is_group_member(group_id));
create policy group_votes_self_insert
  on public.group_leader_votes for insert to authenticated
  with check (
    voter_id = auth.uid()
    and public.workspace_is_group_member(group_id)
    and public.workspace_is_group_member(group_id, candidate_id)
  );
create policy group_votes_self_update
  on public.group_leader_votes for update to authenticated
  using (voter_id = auth.uid())
  with check (
    voter_id = auth.uid()
    and public.workspace_is_group_member(group_id)
    and public.workspace_is_group_member(group_id, candidate_id)
  );
create policy group_votes_self_delete
  on public.group_leader_votes for delete to authenticated
  using (voter_id = auth.uid());

commit;
