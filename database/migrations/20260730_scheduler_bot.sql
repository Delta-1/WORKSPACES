begin;

-- Estado pequeno e isolado por conversa para o Agendador lembrar a proposta
-- pendente e só criar o compromisso depois da confirmação do cliente.
create table if not exists public.bot_scheduler_state (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  lead_name text,
  preferred_name text,
  project_type text,
  idea text,
  summary text,
  status text not null default 'qualifying'
    check (status in ('qualifying', 'proposed', 'booked', 'cancelled')),
  proposed_start timestamptz,
  event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, chatbot_id)
);

create index if not exists bot_scheduler_state_company_status_idx
  on public.bot_scheduler_state(company_id, status, updated_at desc);

alter table public.bot_scheduler_state enable row level security;

drop policy if exists bot_scheduler_state_environment_isolation on public.bot_scheduler_state;
create policy bot_scheduler_state_environment_isolation
  on public.bot_scheduler_state
  as restrictive
  for all
  to authenticated
  using (company_id = public.active_company_id())
  with check (company_id = public.active_company_id());

commit;
