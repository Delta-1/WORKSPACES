begin;

-- Novas contas passam pelo assistente inicial. Contas já existentes ficam
-- marcadas como concluídas para não interromper usuários em produção.
alter table public.company_settings add column if not exists onboarding_completed boolean;
update public.company_settings set onboarding_completed = true where onboarding_completed is null;
alter table public.company_settings alter column onboarding_completed set default false;
alter table public.company_settings alter column onboarding_completed set not null;

alter table public.company_settings add column if not exists onboarding_niche text;
alter table public.company_settings add column if not exists remote_access_limit integer not null default 1;
alter table public.company_settings add column if not exists remote_unlimited boolean not null default false;
alter table public.company_settings add column if not exists wa_unlimited boolean not null default false;

alter table public.company_settings drop constraint if exists company_settings_remote_access_limit_check;
alter table public.company_settings
  add constraint company_settings_remote_access_limit_check check (remote_access_limit >= 1);

-- A chave de voz também pertence ao usuário e nunca precisa aparecer no cliente
-- depois de salva.
alter table public.ai_config add column if not exists elevenlabs_key text;
alter table public.ai_config add column if not exists elevenlabs_voice_id text;

create or replace function public.enforce_whatsapp_access_limit()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_company uuid;
  access_limit integer;
  unlimited boolean;
  current_count integer;
begin
  target_company := coalesce(new.company_id, public.active_company_id());
  if target_company is null then
    return new;
  end if;
  new.company_id := target_company;

  select coalesce(cs.wa_number_limit, 1), coalesce(cs.wa_unlimited, false)
    into access_limit, unlimited
  from public.company_settings cs
  where cs.company_id = target_company;

  if unlimited then return new; end if;
  access_limit := coalesce(access_limit, 1);
  select count(*) into current_count
  from public.whatsapp_numbers wn
  where wn.company_id = target_company
    and (tg_op = 'INSERT' or wn.id <> new.id);

  if current_count >= access_limit then
    raise exception 'Limite de contas do WhatsApp atingido. Atualize o plano para adicionar outro acesso.';
  end if;
  return new;
end
$$;

drop trigger if exists whatsapp_access_limit on public.whatsapp_numbers;
create trigger whatsapp_access_limit
  before insert or update of company_id on public.whatsapp_numbers
  for each row execute function public.enforce_whatsapp_access_limit();

create or replace function public.enforce_remote_access_limit()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  access_limit integer;
  unlimited boolean;
  current_count integer;
begin
  if new.company_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.company_id is not distinct from new.company_id then return new; end if;

  select coalesce(cs.remote_access_limit, 1), coalesce(cs.remote_unlimited, false)
    into access_limit, unlimited
  from public.company_settings cs
  where cs.company_id = new.company_id;

  if unlimited then return new; end if;
  access_limit := coalesce(access_limit, 1);
  select count(*) into current_count
  from public.remote_agents ra
  where ra.company_id = new.company_id
    and (tg_op = 'INSERT' or ra.id <> new.id);

  if current_count >= access_limit then
    raise exception 'Limite de máquinas atingido. Adicione outro acesso remoto ao plano.';
  end if;
  return new;
end
$$;

drop trigger if exists remote_access_limit on public.remote_agents;
create trigger remote_access_limit
  before insert or update of company_id on public.remote_agents
  for each row execute function public.enforce_remote_access_limit();

commit;
