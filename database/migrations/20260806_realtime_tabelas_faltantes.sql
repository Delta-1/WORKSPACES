-- ============================================================================
-- TEMPO REAL DE VERDADE — a causa raiz do "só atualiza com F5".
--
-- O site inteiro assina mudanças via postgres_changes, mas assinar não basta:
-- o Postgres só emite eventos das tabelas que estão na publicação
-- `supabase_realtime`. Nove tabelas eram assinadas pela interface e NUNCA
-- entraram na publicação — a assinatura conectava, ficava viva e não recebia
-- nada, silenciosamente. Nenhum erro em lugar nenhum.
--
-- (Também existia assinatura de `logistics_events`, tabela que nem existe —
-- fica de fora; o cliente aceita e ignora, sem quebrar.)
-- ============================================================================

alter publication supabase_realtime add table
  public.chatbots, public.clients, public.contact_tags, public.finance_entries,
  public.form_responses, public.logistics_finance, public.logistics_stock,
  public.orb_memories, public.third_parties;

-- E as que os tabs passam a assinar nesta leva (calendário, kanban, mural,
-- formulários, números de WhatsApp, carteira):
alter publication supabase_realtime add table
  public.forms, public.contact_credits, public.whatsapp_groups;
