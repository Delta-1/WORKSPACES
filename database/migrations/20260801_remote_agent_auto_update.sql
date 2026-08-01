begin;

-- Atualização do agente de Acesso Remoto passa a ser MANUAL por padrão. Uma
-- empresa pode optar por ligar a instalação automática (aba Configurações do
-- Acesso Remoto) — nesse caso TODAS as máquinas dela atualizam sozinhas,
-- sem interação humana, assim que uma nova versão é publicada.
alter table public.company_settings
  add column if not exists remote_auto_update boolean not null default false;

-- O app (Electron) roda sem sessão de usuário — só tem o agentId + access_code
-- gerados na própria máquina. Segue o mesmo padrão de agent_role(): valida a
-- dupla agentId/access_code e devolve só o que essa máquina pode ver.
create or replace function public.agent_update_policy(p_agent_id uuid, p_access_code text)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select coalesce(cs.remote_auto_update, false)
  from public.remote_agents ra
  left join public.company_settings cs on cs.company_id = ra.company_id
  where ra.id = p_agent_id and ra.access_code = p_access_code;
$$;

revoke all on function public.agent_update_policy(uuid, text) from public;
grant execute on function public.agent_update_policy(uuid, text) to anon, authenticated;

commit;
