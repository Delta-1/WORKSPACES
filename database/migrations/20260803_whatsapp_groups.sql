-- Grupos de WhatsApp: o número conectado enxerga os grupos de que participa, e
-- a IA é ligada GRUPO A GRUPO. Sem estar aqui com ai_enabled, um grupo continua
-- sendo ignorado exatamente como antes — ligar é uma decisão explícita.
create table if not exists public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
  jid text not null,
  subject text,
  participants integer not null default 0,
  -- Nosso número é admin do grupo (só informativo, ajuda a explicar na tela).
  is_admin boolean not null default false,
  ai_enabled boolean not null default false,
  -- Agente que responde neste grupo. Nulo = o chatbot do número.
  chatbot_id uuid references public.chatbots(id) on delete set null,
  -- Em grupo, responder tudo vira spam. Por padrão só quando marcam @ o número
  -- ou respondem uma mensagem dele.
  only_mention boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (number_id, jid)
);

create index if not exists whatsapp_groups_company_idx on public.whatsapp_groups (company_id);
create index if not exists whatsapp_groups_jid_idx on public.whatsapp_groups (jid);

alter table public.whatsapp_groups enable row level security;

create policy company_isolation on public.whatsapp_groups
  for all using (company_id = my_company() or company_id is null)
  with check (company_id = my_company() or company_id is null);

-- Mesmo isolamento por ambiente das outras tabelas: trocar de ambiente troca os
-- grupos visíveis, sem vazar de uma empresa para outra.
create policy environment_isolation on public.whatsapp_groups
  for all using (company_id = active_company_id())
  with check (company_id = active_company_id());

create policy whatsapp_groups_select on public.whatsapp_groups for select using (true);

create policy whatsapp_groups_write on public.whatsapp_groups
  for all using (my_role() = 'gestor') with check (my_role() = 'gestor');

-- Um grupo vira um "contato" para reaproveitar conversa, histórico, pausa do bot
-- e a caixa de entrada inteira. A marca separa grupo de pessoa na tela.
alter table public.contacts add column if not exists is_group boolean not null default false;

comment on column public.contacts.is_group is
  'true = este contato é um GRUPO de WhatsApp (jid @g.us), não uma pessoa.';
