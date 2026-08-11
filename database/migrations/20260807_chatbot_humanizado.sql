-- MODO HUMANIZADO por agente.
--
-- Liga a escrita "como gente" no WhatsApp (abreviações naturais e variadas,
-- tom leve). É por agente porque um bot de suporte formal e um bot de vendas
-- descontraído convivem na mesma empresa. Padrão desligado: quem quer, liga.
alter table public.chatbots add column if not exists humanized boolean not null default false;

comment on column public.chatbots.humanized is
  'Modo humanizado: o agente escreve como uma pessoa real no WhatsApp (abreviações naturais, tom leve). Só muda o TOM, nunca o conteúdo.';
