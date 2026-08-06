-- Deduplicação das mensagens espelhadas pelo WhatsApp multidispositivo.
-- O serviço recebe a mesma mensagem pelo envio web e pelo eco fromMe; wa_id
-- garante uma única bolha no histórico e permite sincronizar mensagens do celular.
alter table public.whatsapp_messages
  add column if not exists wa_id text;

create index if not exists whatsapp_messages_wa_id_idx
  on public.whatsapp_messages (wa_id)
  where wa_id is not null;
