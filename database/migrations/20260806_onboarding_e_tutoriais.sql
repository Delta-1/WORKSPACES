-- ============================================================================
-- ONBOARDING POR NICHO + TUTORIAIS
--
-- Duas peças da primeira experiência de quem entra:
--   • o ramo escolhido no cadastro (só informativo — o que ele LIGA fica em
--     enabled_features, já existente);
--   • quais tutoriais cada pessoa já viu, para o guia aparecer uma vez e nunca
--     mais (até pedir para rever em Configurações).
-- ============================================================================

-- Guarda quais tutoriais a pessoa já viu, por app: {"kanban": true, ...}.
-- Fica no PROFILE, não na empresa: é aprendizado de cada um. Um colega novo
-- entra e vê os guias do zero, mesmo numa empresa antiga.
alter table public.profiles add column if not exists tutorials_done jsonb not null default '{}'::jsonb;
comment on column public.profiles.tutorials_done is
  'Tutoriais já vistos por esta pessoa, por app id. Configurações → Rever tutoriais zera isto.';

-- Ramo/tipo escolhido no cadastro. Informativo; as ferramentas ligadas ficam
-- em enabled_features.
alter table public.company_settings add column if not exists onboarding_niche text;
alter table public.company_settings add column if not exists onboarding_kind text;
comment on column public.company_settings.onboarding_niche is
  'Ramo escolhido no cadastro (id do nicho). As ferramentas ligadas ficam em enabled_features.';
