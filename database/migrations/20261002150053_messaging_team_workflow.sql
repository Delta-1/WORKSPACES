begin;

alter table public.contacts add column if not exists saved_name text;
alter table public.contacts add column if not exists push_name text;
alter table public.contacts add column if not exists name_source text;
alter table public.conversations add column if not exists accepted_at timestamptz;
alter table public.conversations add column if not exists queue_entered_at timestamptz default now();
alter table public.conversations add column if not exists resolution text;
alter table public.conversations add column if not exists resolution_note text;

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null deferrable initially deferred,
  contact_id uuid references public.contacts(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  sector_id uuid references public.sectors(id) on delete set null,
  number_id uuid references public.whatsapp_numbers(id) on delete set null,
  protocol bigint, contact_name text, contact_phone text, employee_name text,
  queued_at timestamptz not null, started_at timestamptz not null default now(),
  first_response_at timestamptz, ended_at timestamptz,
  outcome text check (outcome in ('resolved','unresolved','transferred','automatic')),
  note text, transferred_to uuid references public.profiles(id) on delete set null,
  outgoing_count integer not null default 0
);
create unique index attendance_sessions_one_active on public.attendance_sessions(conversation_id) where ended_at is null;
create index attendance_sessions_company_time on public.attendance_sessions(company_id, started_at desc);
alter table public.attendance_sessions enable row level security;
grant select on public.attendance_sessions to authenticated;
grant all on public.attendance_sessions to service_role;

-- Reports are restricted to company managers and sector leaders, including designated leaders.
create policy attendance_sessions_read on public.attendance_sessions for select to authenticated using (
 company_id = public.active_company_id() and
 (public.my_role() = 'gestor' or
  (public.my_role() = 'gerente' and sector_id = public.my_sector()) or
  exists (select 1 from public.sectors s where s.id = attendance_sessions.sector_id
   and s.company_id = attendance_sessions.company_id and s.leader_id = auth.uid()))
);

create table public.whatsapp_stickers (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 title text not null default 'Figurinha', url text not null,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(company_id,url)
);
alter table public.whatsapp_stickers enable row level security;
grant select,insert,delete on public.whatsapp_stickers to authenticated;
grant all on public.whatsapp_stickers to service_role;
create policy stickers_read on public.whatsapp_stickers for select to authenticated using(company_id = public.active_company_id());
create policy stickers_insert on public.whatsapp_stickers for insert to authenticated with check(company_id = public.active_company_id() and created_by = auth.uid());
create policy stickers_delete on public.whatsapp_stickers for delete to authenticated using(company_id = public.active_company_id() and (created_by = auth.uid() or public.my_role() = 'gestor'));

-- Restrictive policies close the gaps left by older permissive policies.
create policy contacts_active_environment on public.contacts as restrictive for all to authenticated
 using(company_id = public.active_company_id()) with check(company_id = public.active_company_id());
create policy conversations_number_scope on public.conversations as restrictive for all to authenticated
 using (public.can_access_number(number_id) or (public.my_role() = 'gerente' and sector_id = public.my_sector()))
 with check (public.can_access_number(number_id) or (public.my_role() = 'gerente' and sector_id = public.my_sector()));
create policy messages_conversation_scope on public.whatsapp_messages as restrictive for select to authenticated
 using(exists(select 1 from public.conversations c where c.id=conversation_id));
create policy messages_sender_owner on public.whatsapp_messages as restrictive for insert to authenticated
 with check(direction='out' and sender_id=auth.uid() and exists(
 select 1 from public.conversations c where c.id=conversation_id and c.status='atendendo' and c.assignee_id=auth.uid()));

create schema if not exists workspace_private;
revoke all on schema workspace_private from public;

-- Trigger only: no exposed SECURITY DEFINER RPC. RPCs below obey the caller's RLS.
create or replace function workspace_private.track_attendance() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor public.profiles; sess public.attendance_sessions; ct public.contacts;
begin
 if auth.uid() is not null and coalesce(auth.jwt()->>'role','') <> 'service_role' then
  select * into actor from public.profiles where id=auth.uid();
  if actor.company_id is distinct from new.company_id then raise exception 'Ambiente inválido'; end if;
  if tg_op='UPDATE' then
   if actor.role='funcionario' and old.status='atendendo' and old.assignee_id is not null and old.assignee_id<>actor.id then
    raise exception 'Atendimento pertence a outro funcionário';
   end if;
   if (new.assignee_id is distinct from old.assignee_id or new.status is distinct from old.status)
      and coalesce(current_setting('workspace.attendance_action',true),'') <> 'allowed' then
    raise exception 'Use as ações de assumir, transferir ou finalizar atendimento';
   end if;
  elsif new.assignee_id is not null then
   raise exception 'Crie na fila antes de assumir';
  end if;
 end if;
 if tg_op='UPDATE' and old.status in ('fechado','cancelado') and new.status not in ('fechado','cancelado') then
  new.queue_entered_at=now(); new.accepted_at=null; new.resolution=null; new.resolution_note=null;
 end if;
 select * into sess from public.attendance_sessions where conversation_id=new.id and ended_at is null for update;
 if sess.id is not null and (new.status in ('fechado','cancelado') or new.assignee_id is distinct from sess.assignee_id) then
  update public.attendance_sessions set ended_at=now(),
   outcome=case when new.assignee_id is distinct from sess.assignee_id and new.status not in ('fechado','cancelado') then 'transferred' else coalesce(new.resolution,'automatic') end,
   note=new.resolution_note,
   transferred_to=case when new.status not in ('fechado','cancelado') then new.assignee_id else null end
   where id=sess.id;
  sess.id=null;
  if new.status not in ('fechado','cancelado') then new.resolution_note=null; end if;
 end if;
 if new.status='atendendo' and new.assignee_id is not null and sess.id is null then
  select * into ct from public.contacts where id=new.contact_id;
  new.accepted_at=now();
  insert into public.attendance_sessions(company_id,conversation_id,contact_id,assignee_id,sector_id,number_id,protocol,contact_name,contact_phone,employee_name,queued_at)
   values(new.company_id,new.id,new.contact_id,new.assignee_id,new.sector_id,new.number_id,new.protocol,
    coalesce(ct.saved_name,ct.name,ct.phone),ct.phone,
    (select coalesce(full_name,email) from public.profiles where id=new.assignee_id),coalesce(new.queue_entered_at,new.created_at,now()));
 end if;
 return new;
end $$;
revoke all on function workspace_private.track_attendance() from public;
create trigger track_attendance before insert or update on public.conversations for each row execute function workspace_private.track_attendance();

create or replace function workspace_private.track_response() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.direction='out' and new.sender_id is not null then
  update public.attendance_sessions set outgoing_count=outgoing_count+1,first_response_at=coalesce(first_response_at,new.at)
   where conversation_id=new.conversation_id and assignee_id=new.sender_id and ended_at is null;
 end if;
 return new;
end $$;
revoke all on function workspace_private.track_response() from public;
create trigger track_attendance_response after insert on public.whatsapp_messages for each row execute function workspace_private.track_response();

create or replace function public.attendance_action(cid uuid, action text, target uuid default null, result text default null, observation text default null)
returns public.conversations language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.conversations; actor public.profiles; recipient public.profiles;
begin
 if auth.uid() is null then raise exception 'Faça login'; end if;
 select * into actor from public.profiles where id=auth.uid();
 select * into c from public.conversations where id=cid and company_id=actor.company_id for update;
 if c.id is null then raise exception 'Atendimento indisponível'; end if;
 if action <> 'claim' and c.assignee_id is distinct from actor.id and not
  (actor.role='gestor' or (actor.role='gerente' and c.sector_id=actor.sector_id)) then
  raise exception 'Somente o responsável ou líder pode alterar este atendimento';
 end if;
 perform set_config('workspace.attendance_action','allowed',true);
 if action='claim' then
  if c.status='atendendo' and c.assignee_id is not null and c.assignee_id<>actor.id then
   raise exception 'Outro atendente já assumiu. Solicite uma transferência';
  end if;
  update public.conversations set assignee_id=actor.id,status='atendendo',closed_at=null,bot_paused=true,closing_sent=false,
   sector_id=coalesce(sector_id,actor.sector_id) where id=cid returning * into c;
 elsif action='transfer' then
  if c.status<>'atendendo' or c.assignee_id is null then raise exception 'Assuma o atendimento antes de transferir'; end if;
  select * into recipient from public.profiles where id=target and company_id=actor.company_id;
  if recipient.id is null or recipient.id=c.assignee_id then raise exception 'Escolha outro atendente da empresa'; end if;
  if recipient.role<>'gestor' and c.number_id is not null and exists(select 1 from public.whatsapp_number_access where number_id=c.number_id)
   and not exists(select 1 from public.whatsapp_number_access where number_id=c.number_id and (profile_id=target or sector_id=recipient.sector_id))
   and not (recipient.role='gerente' and recipient.sector_id=c.sector_id) then
    raise exception 'Este atendente não tem acesso ao número';
  end if;
  update public.conversations set assignee_id=target,queue_entered_at=now(),sector_id=coalesce(recipient.sector_id,sector_id),resolution_note=nullif(trim(observation),'') where id=cid returning * into c;

 elsif action='finish' then
  if c.status<>'atendendo' or c.assignee_id is null then raise exception 'Assuma o atendimento antes de finalizar'; end if;
  if result is null or result not in ('resolved','unresolved') then raise exception 'Informe se foi resolvido'; end if;
  update public.conversations set status='fechado',closed_at=now(),bot_paused=true,closing_sent=true,
   resolution=result,resolution_note=nullif(trim(observation),'') where id=cid returning * into c;
 else raise exception 'Ação inválida'; end if;
 perform set_config('workspace.attendance_action','',true);
 return c;
end $$;
revoke all on function public.attendance_action(uuid,text,uuid,text,text) from public;
grant execute on function public.attendance_action(uuid,text,uuid,text,text) to authenticated;

-- Realtime for contact names and team reports.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='contacts') then
  alter publication supabase_realtime add table public.contacts;
 end if;
 alter publication supabase_realtime add table public.attendance_sessions;
end $$;
commit;
