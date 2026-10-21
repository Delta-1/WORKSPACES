begin;
alter table public.whatsapp_messages add column if not exists wa_key jsonb;
alter table public.whatsapp_messages add column if not exists edited_at timestamptz;
alter table public.whatsapp_messages add column if not exists deleted_at timestamptz;

-- Protocol IDs and confirmations must only be written by the trusted service.
-- Keep existing browser inserts compatible, while preventing forged WhatsApp keys.
create or replace function workspace_private.guard_whatsapp_message_protocol()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if current_user in ('authenticated', 'anon') then
    if TG_OP = 'UPDATE' then
      raise exception 'Altere mensagens pelo serviço de WhatsApp.' using errcode = '42501';
    end if;
    if new.wa_id is not null or new.wa_key is not null or new.edited_at is not null or new.deleted_at is not null then
      raise exception 'Confirmações do WhatsApp só podem ser gravadas pelo serviço.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function workspace_private.guard_whatsapp_message_protocol() from public, anon, authenticated;
drop trigger if exists guard_whatsapp_message_protocol on public.whatsapp_messages;
create trigger guard_whatsapp_message_protocol before insert or update on public.whatsapp_messages
for each row execute function workspace_private.guard_whatsapp_message_protocol();
commit;
