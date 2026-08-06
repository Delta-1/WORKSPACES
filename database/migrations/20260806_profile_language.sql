-- Idioma é uma preferência pessoal: acompanha o usuário em qualquer empresa
-- e define, entre outras coisas, a tradução das notícias do aplicativo Mundo.
alter table public.profiles
  add column if not exists language text not null default 'pt-BR';

update public.profiles
set language = 'pt-BR'
where language is null or language not in ('pt-BR', 'en-US', 'es-419', 'fr-FR', 'de-DE', 'it-IT');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_language_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_language_check
      check (language in ('pt-BR', 'en-US', 'es-419', 'fr-FR', 'de-DE', 'it-IT'));
  end if;
end $$;
