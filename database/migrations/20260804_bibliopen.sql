-- ============================================================================
-- BIBLIOPEN — biblioteca de medicina com bibliotecária (Nina).
--
-- Duas origens de acervo, e a diferença entre elas é jurídica, não técnica:
--   • 'aberto'  — domínio público / open access (StatPearls CC-BY, SciELO,
--                 NCBI Bookshelf, OpenStax…). Pode ler, pode baixar, pode tudo.
--   • 'proprio' — material produzido pela casa ou cedido pelo autor. Também
--                 pode tudo, porque o direito é nosso.
--   • 'link'    — só um ponteiro para fora (o diretório antigo). NUNCA entra no
--                 leitor e NUNCA é cobrado: não temos direito de distribuir.
--
-- É `origem` que decide se o livro pode ficar atrás da contribuição. A regra
-- mora no banco (CHECK), não no bom senso de quem cadastra.
-- ============================================================================

create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  autor text,
  materia text,
  tipo text default 'Livro',
  edicao text,
  ano integer,
  idioma text default 'pt',
  isbn text,
  capa_url text,
  descricao text,

  origem text not null default 'link' check (origem in ('aberto', 'proprio', 'link')),
  fonte text,
  licenca text,
  fonte_url text,
  arquivo_url text,
  link_externo text,

  disponivel_no_leitor boolean not null default false
    check (not disponivel_no_leitor or origem in ('aberto', 'proprio')),

  busca tsvector generated always as (
    to_tsvector('portuguese',
      coalesce(titulo, '') || ' ' || coalesce(autor, '') || ' ' ||
      coalesce(materia, '') || ' ' || coalesce(edicao, '') || ' ' || coalesce(descricao, ''))
  ) stored,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists library_books_busca_idx on public.library_books using gin (busca);
create index if not exists library_books_materia_idx on public.library_books (materia);
create index if not exists library_books_origem_idx on public.library_books (origem);
create unique index if not exists library_books_unico_idx
  on public.library_books (lower(titulo), coalesce(lower(edicao), ''), coalesce(lower(autor), ''));

comment on column public.library_books.origem is
  'aberto = open access/domínio público; proprio = material da casa ou cedido; link = só ponteiro externo (nunca no leitor, nunca cobrado).';

alter table public.library_books enable row level security;
create policy library_books_leitura on public.library_books for select using (true);
create policy library_books_escrita on public.library_books
  for all to authenticated using (my_role() = 'gestor') with check (my_role() = 'gestor');

-- ── Licença de leitura ──────────────────────────────────────────────────────
create table if not exists public.library_licenses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  email text,
  livro_id uuid references public.library_books(id) on delete cascade,
  tipo text not null check (tipo in ('avulsa', 'mensal')),
  valor_centavos integer not null check (valor_centavos > 0),
  expira_em timestamptz,
  mp_payment_id text unique,
  criado_em timestamptz not null default now(),
  constraint licenca_tem_dono check (contact_id is not null or email is not null)
);

create index if not exists library_licenses_contato_idx on public.library_licenses (contact_id);
create index if not exists library_licenses_email_idx on public.library_licenses (lower(email));

alter table public.library_licenses enable row level security;
create policy library_licenses_gestor on public.library_licenses
  for select to authenticated using (my_role() = 'gestor');

create or replace function public.library_pode_ler(
  p_livro uuid, p_contact uuid default null, p_email text default null
)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.library_licenses l
    where (
        (p_contact is not null and l.contact_id = p_contact)
        or (p_email is not null and lower(l.email) = lower(p_email))
      )
      and (l.livro_id = p_livro or l.livro_id is null)
      and (l.expira_em is null or l.expira_em > now())
  );
$$;

revoke all on function public.library_pode_ler(uuid, uuid, text) from public;
grant execute on function public.library_pode_ler(uuid, uuid, text) to authenticated, service_role;
