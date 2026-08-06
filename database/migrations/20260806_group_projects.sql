-- QUADROS DE PROJETO — o "Miro" dentro do Group.
--
-- Cada projeto é uma tela infinita (mapa mental, fluxograma, desenho livre)
-- guardada como JSON em `scene`. O conteúdo mora todo num campo só de propósito:
-- é um documento de desenho, não dados relacionais — normalizar cada nó em
-- linha só criaria junção sem ganho, e o quadro é sempre lido inteiro.
create table if not exists public.group_projects (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null default 'Novo projeto',
  scene jsonb not null default '{"nodes":[],"edges":[],"strokes":[]}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_projects_group_idx on public.group_projects (group_id, updated_at desc);

alter table public.group_projects enable row level security;

-- Só membro do grupo vê e mexe — a mesma regra do resto do Group.
create policy group_projects_member_all on public.group_projects
  for all to authenticated
  using (public.workspace_is_group_member(group_id))
  with check (public.workspace_is_group_member(group_id));

-- Tempo real: o quadro é feito para desenhar JUNTO numa reunião. Sem isto, cada
-- pessoa veria a própria versão até recarregar.
alter publication supabase_realtime add table public.group_projects;
