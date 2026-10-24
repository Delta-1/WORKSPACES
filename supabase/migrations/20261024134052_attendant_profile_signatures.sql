-- Profile presentation is personal; existing account roles and permissions are unchanged.
alter table public.profiles add column if not exists attendance_name text
  check (attendance_name is null or char_length(attendance_name) <= 80);
alter table public.profiles add column if not exists language text not null default 'pt-BR'
  check (language in ('pt-BR','en-US','es-419','fr-FR','de-DE','it-IT'));
alter table public.whatsapp_messages add column if not exists signature_name text
  check (signature_name is null or char_length(signature_name) <= 80);

-- OAuth metadata initializes a new profile, but must not undo a saved name or
-- resurrect a removed photo on the next login/token refresh.
create or replace function public.ensure_profile(p_full_name text, p_avatar_url text)
returns public.profiles language plpgsql security definer set search_path = public
as $$
declare v_email text; v_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_email := auth.jwt() ->> 'email';
  select * into v_profile from public.profiles where id = auth.uid();
  if found then
    update public.profiles set email = coalesce(v_email, email)
      where id = auth.uid() returning * into v_profile;
    return v_profile;
  end if;
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (auth.uid(), v_email, p_full_name, p_avatar_url, 'funcionario')
  returning * into v_profile;
  return v_profile;
end $$;
revoke all on function public.ensure_profile(text,text) from public, anon;
grant execute on function public.ensure_profile(text,text) to authenticated;
notify pgrst, 'reload schema';
