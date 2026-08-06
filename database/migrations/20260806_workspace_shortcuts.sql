begin;

-- ATALHOS DO WORKSPACES
-- O banco guarda somente metadados, permissões e estado de sincronização.
-- O arquivo real de cada atalho de Group é materializado pelo agente no servidor
-- vinculado em Arquivos/Groups/<Group>/*.workspace-link.json.
create table if not exists public.workspace_shortcuts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  scope text not null default 'personal' check (scope in ('personal', 'company', 'group')),
  name text not null check (char_length(name) between 1 and 80),
  description text,
  target_kind text not null check (target_kind in ('web', 'workspace', 'local_app')),
  target text not null check (char_length(target) between 1 and 2048),
  provider text not null default 'link',
  pin_to_dock boolean not null default false,
  file_node_id uuid,
  server_agent_id uuid references public.remote_agents(id) on delete set null,
  server_status text not null default 'waiting_server' check (server_status in ('waiting_server', 'pending', 'synced', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_shortcut_group_scope check (
    (scope = 'group' and group_id is not null) or (scope <> 'group' and group_id is null)
  )
);

create index if not exists workspace_shortcuts_company_idx on public.workspace_shortcuts(company_id, updated_at desc);
create index if not exists workspace_shortcuts_group_idx on public.workspace_shortcuts(group_id, updated_at desc) where group_id is not null;
create index if not exists workspace_shortcuts_creator_idx on public.workspace_shortcuts(created_by, updated_at desc);

alter table public.files
  add column if not exists external_url text,
  add column if not exists external_provider text,
  add column if not exists external_kind text,
  add column if not exists shortcut_id uuid,
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'files_shortcut_id_fkey') then
    alter table public.files
      add constraint files_shortcut_id_fkey foreign key (shortcut_id)
      references public.workspace_shortcuts(id) on delete cascade;
  end if;
end
$$;

create unique index if not exists files_shortcut_unique on public.files(shortcut_id) where shortcut_id is not null;
create index if not exists files_group_idx on public.files(group_id) where group_id is not null;

create or replace function public.workspace_can_manage_group(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and (g.created_by = p_user_id or g.leader_id = p_user_id)
  )
$$;

revoke all on function public.workspace_can_manage_group(uuid, uuid) from public;
grant execute on function public.workspace_can_manage_group(uuid, uuid) to authenticated;

-- Diretório seguro do Group. A leitura direta profiles(...) falha quando há
-- membros de outro ambiente, porque a RLS de perfis é isolada por empresa.
-- Este RPC revela somente nome/e-mail de participantes do mesmo Group.
create or replace function public.group_member_directory(p_group_id uuid)
returns table (user_id uuid, joined_at timestamptz, full_name text, email text)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select gm.user_id, gm.joined_at, p.full_name, coalesce(p.email, '')
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and public.workspace_is_group_member(p_group_id)
  order by gm.joined_at
$$;

revoke all on function public.group_member_directory(uuid) from public;
grant execute on function public.group_member_directory(uuid) to authenticated;

alter table public.workspace_shortcuts enable row level security;

create policy workspace_shortcuts_read on public.workspace_shortcuts
  for select to authenticated
  using (
    (scope = 'personal' and created_by = auth.uid())
    or (scope = 'company' and company_id = public.active_company_id())
    or (scope = 'group' and public.workspace_is_group_member(group_id))
  );

create policy workspace_shortcuts_insert on public.workspace_shortcuts
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and company_id = public.active_company_id()
    and (
      scope = 'personal'
      or (scope = 'company' and exists (
        select 1 from public.profiles p where p.id = auth.uid() and p.role in ('gestor', 'gerente')
      ))
      or (scope = 'group' and public.workspace_can_manage_group(group_id))
    )
  );

create policy workspace_shortcuts_update on public.workspace_shortcuts
  for update to authenticated
  using (
    (scope = 'personal' and created_by = auth.uid())
    or (scope = 'company' and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.company_id = workspace_shortcuts.company_id and p.role in ('gestor', 'gerente')
    ))
    or (scope = 'group' and public.workspace_can_manage_group(group_id))
  )
  with check (
    company_id = public.active_company_id()
    and (
      (scope = 'personal' and created_by = auth.uid())
      or (scope = 'company' and exists (
        select 1 from public.profiles p where p.id = auth.uid() and p.role in ('gestor', 'gerente')
      ))
      or (scope = 'group' and public.workspace_can_manage_group(group_id))
    )
  );

create policy workspace_shortcuts_delete on public.workspace_shortcuts
  for delete to authenticated
  using (
    (scope = 'personal' and created_by = auth.uid())
    or (scope = 'company' and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.company_id = workspace_shortcuts.company_id and p.role in ('gestor', 'gerente')
    ))
    or (scope = 'group' and public.workspace_can_manage_group(group_id))
  );

grant select, insert, update, delete on public.workspace_shortcuts to authenticated;

-- Cria/atualiza o nó flutuante dentro da pasta do Group no grafo da empresa.
-- Nenhum byte é enviado ao Supabase Storage: o nó contém apenas o endereço.
create or replace function public.workspace_materialize_group_shortcut()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_groups_root uuid;
  v_group_folder uuid;
  v_server public.remote_agents%rowtype;
  v_group_name text;
  v_node uuid;
begin
  if new.scope <> 'group' or new.group_id is null then
    return new;
  end if;

  select * into v_server
  from public.remote_agents
  where company_id = new.company_id and is_server = true
  order by case when status = 'online' then 0 else 1 end, created_at
  limit 1;

  select name into v_group_name from public.groups where id = new.group_id;

  select id into v_groups_root from public.files
  where company_id = new.company_id and type = 'folder' and name = 'Groups'
    and parent_id is not distinct from v_server.graph_folder_id
  order by created_at limit 1;

  if v_groups_root is null then
    insert into public.files(name, type, parent_id, company_id, server_agent_id, source_path)
    values ('Groups', 'folder', v_server.graph_folder_id, new.company_id, v_server.id,
      case when v_server.server_root is not null then v_server.server_root || '/Arquivos/Groups' else null end)
    returning id into v_groups_root;
  end if;

  select id into v_group_folder from public.files
  where company_id = new.company_id and type = 'folder' and group_id = new.group_id
  order by created_at limit 1;

  if v_group_folder is null then
    insert into public.files(name, type, parent_id, company_id, group_id, server_agent_id, source_path)
    values (coalesce(v_group_name, 'Group'), 'folder', v_groups_root, new.company_id, new.group_id, v_server.id,
      case when v_server.server_root is not null then v_server.server_root || '/Arquivos/Groups/' || coalesce(v_group_name, 'Group') else null end)
    returning id into v_group_folder;
  end if;

  insert into public.files(
    name, type, parent_id, company_id, uploaded_by, mime, external_url,
    external_provider, external_kind, shortcut_id, group_id, server_agent_id, source_path
  ) values (
    new.name, 'file', v_group_folder, new.company_id, new.created_by,
    'application/x-workspace-link', new.target, new.provider, new.target_kind, new.id, new.group_id, v_server.id,
    case when v_server.server_root is not null then
      v_server.server_root || '/Arquivos/Groups/' || coalesce(v_group_name, 'Group') || '/' || new.name || '.workspace-link.json'
    else null end
  )
  on conflict (shortcut_id) where shortcut_id is not null do update set
    name = excluded.name,
    external_url = excluded.external_url,
    external_provider = excluded.external_provider,
    external_kind = excluded.external_kind,
    server_agent_id = excluded.server_agent_id,
    source_path = excluded.source_path
  returning id into v_node;

  update public.workspace_shortcuts set
    file_node_id = v_node,
    server_agent_id = v_server.id,
    server_status = case when v_server.id is null then 'waiting_server' else 'pending' end
  where id = new.id;

  return new;
end
$$;

create trigger workspace_shortcut_materialize
after insert or update of name, target, provider on public.workspace_shortcuts
for each row execute function public.workspace_materialize_group_shortcut();

create or replace function public.workspace_shortcuts_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end
$$;

create trigger workspace_shortcuts_touch
before update on public.workspace_shortcuts
for each row execute function public.workspace_shortcuts_touch();

-- O agente autenticado pelo próprio código recebe só atalhos da empresa dele.
create or replace function public.agent_workspace_shortcuts(p_agent_id uuid, p_access_code text)
returns table (
  id uuid, name text, description text, target_kind text, target text,
  provider text, group_id uuid, group_name text, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare v_company uuid;
begin
  select a.company_id into v_company from public.remote_agents a
  where a.id = p_agent_id and a.access_code = p_access_code and a.is_server = true;
  if v_company is null then return; end if;
  return query
    select s.id, s.name, s.description, s.target_kind, s.target, s.provider,
      s.group_id, g.name, s.updated_at
    from public.workspace_shortcuts s
    left join public.groups g on g.id = s.group_id
    where s.company_id = v_company and s.scope = 'group'
    order by g.name, s.name;
end
$$;

revoke all on function public.agent_workspace_shortcuts(uuid, text) from public;
grant execute on function public.agent_workspace_shortcuts(uuid, text) to anon, authenticated;

create or replace function public.agent_mark_workspace_shortcuts_synced(
  p_agent_id uuid, p_access_code text, p_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare v_company uuid; v_count integer;
begin
  select a.company_id into v_company from public.remote_agents a
  where a.id = p_agent_id and a.access_code = p_access_code and a.is_server = true;
  if v_company is null then return 0; end if;
  update public.workspace_shortcuts
    set server_status = 'synced', server_agent_id = p_agent_id
  where company_id = v_company and id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.agent_mark_workspace_shortcuts_synced(uuid, text, uuid[]) from public;
grant execute on function public.agent_mark_workspace_shortcuts_synced(uuid, text, uuid[]) to anon, authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.workspace_shortcuts;
  exception when duplicate_object then null;
  end;
end
$$;

commit;
