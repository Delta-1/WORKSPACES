-- SEXO DO AGENTE + FIGURINHAS POR BOT.
--
-- 1) Sexo do agente: um bot pode se apresentar no masculino, no feminino ou
--    neutro. Muda só a CONCORDÂNCIA de quem ele é ("fico feliz em ajudar",
--    "obrigado/obrigada", "pronto/pronta"), nunca o conteúdo.
alter table public.chatbots add column if not exists gender text not null default 'neutro';
comment on column public.chatbots.gender is
  'Sexo do agente para concordância no WhatsApp: masculino | feminino | neutro.';

-- 2) Figurinhas por bot: nem toda figurinha serve para todo bot. Aqui a empresa
--    diz QUAIS agentes têm direito a cada figurinha. NULL = todos os bots podem
--    usar; lista preenchida = só os bots dessa lista.
alter table public.bot_stickers add column if not exists chatbot_ids uuid[];
comment on column public.bot_stickers.chatbot_ids is
  'Bots que podem usar esta figurinha. NULL = todos os bots da empresa.';
