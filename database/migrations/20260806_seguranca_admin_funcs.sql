-- ============================================================================
-- SEGURANÇA — fechando o que os advisors do Supabase apontaram.
--
-- O achado que importava: 97 funções SECURITY DEFINER eram executáveis pelo
-- papel `anon` (quem NÃO está logado) via a API REST. A maioria se protege por
-- dentro (checa is_super_admin ou usa my_company), mas uma não checava nada.
-- ============================================================================

-- 1) VAZAMENTO REAL: admin_get_company_features devolvia as features de
-- QUALQUER empresa para QUALQUER um, inclusive anônimo — era a única admin_*
-- sem a guarda de super-admin. Agora checa, igual às irmãs.
create or replace function public.admin_get_company_features(p_company uuid)
returns text[]
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if not is_super_admin() then raise exception 'Acesso negado'; end if;
  return (select coalesce(enabled_features, '{}') from public.company_settings where company_id = p_company);
end $$;

-- 2) DEFESA EM PROFUNDIDADE: nenhuma admin_* é chamada por quem não está
-- logado. Tirar o EXECUTE do anon fecha a porta antes de a função rodar;
-- `authenticated` continua, e a checagem interna barra quem não é super.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from anon, public', f.sig);
  end loop;
end $$;

-- 3) search_path fixo no trigger de timestamp.
create or replace function public.update_ai_config_timestamp()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- NOTA — deixados como estão, de propósito:
--  • Tabelas com RLS ligado e sem policy (super_admins, wa_auth,
--    automation_deliveries, work_messages): "sem policy" significa que nenhum
--    cliente acessa, só a service role. Para tabela de credencial e de sistema
--    é o estado certo — abrir com uma policy seria o erro.
--  • "Leaked password protection" é ajuste do painel de Auth do Supabase, não
--    SQL. Recomendo ligar em Authentication → Policies.
