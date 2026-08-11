-- ============================================================================
-- ONBOARDING DO DONO + BOT DE TRIAGEM + MÉTRICAS DE ATENDIMENTO + PERFIL
--
-- Um pacote só, porque as peças conversam entre si: no cadastro, o dono
-- responde um onboarding curto (nº de funcionários, que chat a equipe vê, se
-- quer bot de triagem e como, se liga métricas e metas). A triagem distribui
-- o atendimento entre os atendentes com rodízio + timeout; as métricas contam
-- os atendimentos de cada um; o perfil mostra tudo, com destaque dourado quando
-- a meta é batida.
-- ============================================================================

-- 1) CONFIG DA EMPRESA (onboarding + triagem + métricas) --------------------
alter table public.company_settings add column if not exists onboarding_done boolean not null default false;
alter table public.company_settings add column if not exists employee_estimate int;
-- Layouts que os funcionários PODEM usar (subconjunto de classic/kanban/crm).
-- Vazio/null = todos liberados; um só = fica travado nele.
alter table public.company_settings add column if not exists chat_modes text[];
-- Bot de triagem: entende o cliente e distribui para um atendente.
alter table public.company_settings add column if not exists triage_enabled boolean not null default false;
-- 'one_by_one' (um atendente por vez, com timeout) | 'broadcast' (todos ao mesmo tempo).
alter table public.company_settings add column if not exists triage_mode text not null default 'one_by_one';
alter table public.company_settings add column if not exists triage_timeout_minutes int not null default 20;
-- Métricas de atendimento por funcionário + metas.
alter table public.company_settings add column if not exists metrics_enabled boolean not null default false;
alter table public.company_settings add column if not exists attendance_goal_week int;
alter table public.company_settings add column if not exists attendance_goal_month int;

-- 2) TRIAGEM na conversa (rodízio + escalonamento) --------------------------
-- Quando o atendimento foi oferecido ao assignee atual (para o timeout).
alter table public.conversations add column if not exists triage_offered_at timestamptz;
-- Atendentes a quem já foi oferecido (para não repetir no rodízio).
alter table public.conversations add column if not exists triage_tried_ids uuid[] not null default '{}';
-- Ninguém pegou no rodízio → liberado para todos ("quem pegar, pegou").
alter table public.conversations add column if not exists triage_open_to_all boolean not null default false;
-- Já avisamos o cliente "aguarde um minutinho"? (para não repetir)
alter table public.conversations add column if not exists triage_waited boolean not null default false;
-- Quando um atendente humano de fato assumiu (respondeu) — p/ métricas e p/ parar o escalonamento.
alter table public.conversations add column if not exists accepted_at timestamptz;

create index if not exists conversations_triage_idx
  on public.conversations (company_id, status, triage_offered_at)
  where triage_offered_at is not null;

-- 3) PERFIL do funcionário (estilo Instagram) -------------------------------
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists cover_url text;
