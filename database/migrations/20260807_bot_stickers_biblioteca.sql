-- BIBLIOTECA DE FIGURINHAS dos bots.
--
-- Quando alguém manda uma figurinha no WhatsApp, ela chega em Mensagens. A
-- pessoa pode salvar essa figurinha e dar uma DESCRIÇÃO ("risada", "joia",
-- "gato fofo"). A figurinha fica registrada para a empresa e o bot passa a
-- poder mandá-la sozinho, num contexto brincalhão — ele escreve o marcador
-- [[fig: risada]] e o serviço troca pelo envio da figurinha certa.
create table if not exists public.bot_stickers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  descricao text not null,
  media_url text not null,
  mime text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.bot_stickers is
  'Biblioteca de figurinhas por empresa. O bot manda a figurinha certa via marcador [[fig: descrição]].';

create index if not exists bot_stickers_company_idx on public.bot_stickers (company_id, created_at desc);

alter table public.bot_stickers enable row level security;

-- Cada empresa só vê/gerencia as próprias figurinhas.
drop policy if exists bot_stickers_rw on public.bot_stickers;
create policy bot_stickers_rw on public.bot_stickers
  for all using (company_id = my_company()) with check (company_id = my_company());

-- Tempo real: figurinha salva aparece na hora para todo mundo da empresa.
alter publication supabase_realtime add table public.bot_stickers;
