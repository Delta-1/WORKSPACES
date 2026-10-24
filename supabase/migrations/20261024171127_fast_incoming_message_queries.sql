set lock_timeout = '3s';
set statement_timeout = '30s';
create index if not exists whatsapp_messages_thread_at_id_idx on public.whatsapp_messages (conversation_id, at desc, id desc);
create index if not exists conversations_contact_number_created_idx on public.conversations (company_id, contact_id, number_id, created_at desc);
create index if not exists conversations_company_last_message_idx on public.conversations (company_id, last_message_at desc);
