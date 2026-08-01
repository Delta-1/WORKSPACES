begin;

-- Timers do fluxograma do bot (nó "Lembrete / sem resposta"): quando o cliente
-- não responde dentro do prazo configurado no bloco "wait" do BotFlowBuilder,
-- o whatsapp-service (flowTimerSweep) dispara a mensagem de lembrete e segue o
-- fluxo pela saída "sem resposta". Se o cliente responder antes, o fluxo segue
-- normalmente pela saída "respondeu" e o timer é apagado.
create table if not exists public.bot_flow_timers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  chatbot_id uuid not null references public.chatbots(id) on delete cascade,
  company_id uuid,
  node_id text not null,
  due_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists bot_flow_timers_due_idx on public.bot_flow_timers (due_at);
create index if not exists bot_flow_timers_conversation_idx on public.bot_flow_timers (conversation_id);

-- Tabela é escrita/lida só pelo whatsapp-service (service_role, ignora RLS).
-- Mesmo assim habilita RLS + a mesma política de isolamento por ambiente usada
-- nas demais tabelas internas, para nunca ficar exposta por engano via API.
alter table public.bot_flow_timers enable row level security;

drop policy if exists environment_isolation on public.bot_flow_timers;
create policy environment_isolation on public.bot_flow_timers
  as restrictive for all to authenticated
  using (company_id = public.active_company_id())
  with check (company_id = public.active_company_id());

commit;
