-- Additive: existing history, permissions and delivery remain unchanged.
set lock_timeout = '3s';
set statement_timeout = '30s';
alter table public.whatsapp_messages add column if not exists reply_to jsonb;
comment on column public.whatsapp_messages.reply_to is 'Quote snapshot (local/WhatsApp IDs, author, text and media type); no private media/session keys.';
