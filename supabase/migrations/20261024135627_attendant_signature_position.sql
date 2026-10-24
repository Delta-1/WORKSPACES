-- New replies start with the operator's bold identification by default.
alter table public.profiles add column if not exists attendance_position text not null default 'top'
  check (attendance_position in ('top','bottom'));
-- Earlier messages were delivered with a footer. Keep their actual layout when
-- displaying/editing them; new sends explicitly capture the user's preference.
alter table public.whatsapp_messages add column if not exists signature_position text not null default 'bottom'
  check (signature_position in ('top','bottom'));
notify pgrst, 'reload schema';
