begin;
create table public.message_automations (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 enabled boolean not null default false,
 trigger_type text not null default 'incoming' check(trigger_type in ('incoming','scheduled')),
 match_mode text not null default 'contains' check(match_mode in ('any','contains','exact')),
 keywords text not null default '' check(length(keywords)<=1000),
 cooldown_minutes integer not null default 1440 check(cooldown_minutes between 1 and 43200),
 priority integer not null default 100 check(priority between 1 and 1000),
 pause_on_human boolean not null default true,
 scheduled_at timestamptz,
 target_conversation_id uuid references public.conversations(id) on delete cascade,
 flow jsonb not null check(jsonb_typeof(flow)='object' and octet_length(flow::text)<=200000),
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 check(trigger_type <> 'scheduled' or (scheduled_at is not null and target_conversation_id is not null)),
 check(trigger_type <> 'incoming' or match_mode='any' or length(trim(keywords))>0)
);
create index message_automations_number on public.message_automations(number_id,enabled,trigger_type,priority);
create index message_automations_schedule on public.message_automations(scheduled_at) where enabled and trigger_type='scheduled';
alter table public.message_automations enable row level security;
revoke all on public.message_automations from anon,authenticated;
grant select,insert,update,delete on public.message_automations to authenticated;
grant all on public.message_automations to service_role;
create policy message_automations_read on public.message_automations for select to authenticated using(
 company_id=public.active_company_id() and exists(select 1 from public.whatsapp_numbers n where n.id=number_id and n.company_id=message_automations.company_id and public.can_access_number(n.id))
);
create policy message_automations_manage on public.message_automations for all to authenticated using(
 company_id=public.active_company_id() and public.my_role() in ('gestor','gerente') and exists(select 1 from public.whatsapp_numbers n where n.id=number_id and n.company_id=message_automations.company_id and public.can_access_number(n.id))
) with check(
 company_id=public.active_company_id() and public.my_role() in ('gestor','gerente') and exists(select 1 from public.whatsapp_numbers n where n.id=number_id and n.company_id=message_automations.company_id and public.can_access_number(n.id))
 and (target_conversation_id is null or exists(select 1 from public.conversations c where c.id=target_conversation_id and c.company_id=message_automations.company_id and c.number_id=message_automations.number_id))
);
create table public.message_automation_runs (
 id uuid primary key default gen_random_uuid(),
 automation_id uuid references public.message_automations(id) on delete set null,
 company_id uuid not null references public.companies(id) on delete cascade,
 number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 contact_id uuid references public.contacts(id) on delete cascade,
 automation_name text not null,
 incoming_key text not null,
 received_text text not null default '', contact_name text not null default '',
 flow jsonb not null,node_id text not null,
 status text not null default 'queued' check(status in ('queued','waiting_reply','running','completed','failed','canceled')),
 due_at timestamptz not null default now(),lease_until timestamptz,lease_token uuid,
 steps_done integer not null default 0,error text,
 created_at timestamptz not null default now(),finished_at timestamptz,
 unique(number_id,incoming_key)
);
create index message_automation_runs_due on public.message_automation_runs(due_at) where status='queued';
create index message_automation_runs_cooldown on public.message_automation_runs(automation_id,contact_id,created_at desc);
create index message_automation_runs_company on public.message_automation_runs(company_id,created_at desc);
create index message_automation_runs_reply on public.message_automation_runs(conversation_id,due_at) where status='waiting_reply';
create table workspace_private.message_automation_inputs (
 number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
 message_key text not null,
 run_id uuid not null references public.message_automation_runs(id) on delete cascade,
 primary key(number_id,message_key)
);
alter table workspace_private.message_automation_inputs enable row level security;
grant usage on schema workspace_private to service_role;
grant all on workspace_private.message_automation_inputs to service_role;
alter table public.message_automation_runs enable row level security;
revoke all on public.message_automation_runs from anon,authenticated;
grant select on public.message_automation_runs to authenticated;
grant all on public.message_automation_runs to service_role;
create policy message_automation_runs_read on public.message_automation_runs for select to authenticated using(
 company_id=public.active_company_id() and public.my_role() in ('gestor','gerente') and public.can_access_number(number_id)
);
-- Service-only invoker RPCs: authenticated users cannot enqueue or execute messages.
create function public.reserve_message_automation(rule_id uuid,conversation_id uuid,message_key text,received_text text default '',contact_name text default '') returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare rule public.message_automations; conv public.conversations; start_id text; run_id uuid;
begin
 select * into rule from public.message_automations where id=rule_id and enabled for update;
 if not found then return null; end if;
 select * into conv from public.conversations c where c.id=reserve_message_automation.conversation_id for share;
 if not found or conv.company_id<>rule.company_id or conv.number_id<>rule.number_id or conv.status in ('fechado','cancelado') then return null; end if;
 if not exists(select 1 from public.whatsapp_numbers n where n.id=rule.number_id and n.company_id=rule.company_id) then return null; end if;
 if rule.pause_on_human and (conv.assignee_id is not null or conv.bot_paused) then return null; end if;
 if rule.trigger_type='scheduled' and (rule.scheduled_at>now() or rule.target_conversation_id<>conv.id or message_key not like concat('scheduled:',rule.id,':%')) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(rule.number_id::text||message_key,0));
 if exists(select 1 from workspace_private.message_automation_inputs i where i.number_id=rule.number_id and i.message_key=reserve_message_automation.message_key) then return null; end if;
 if length(message_key)>300 or length(message_key)=0 then return null; end if;
 if rule.trigger_type='incoming' and exists(select 1 from public.message_automation_runs r where r.automation_id=rule.id and r.contact_id=conv.contact_id and r.status not in ('failed','canceled') and r.created_at>now()-make_interval(mins=>rule.cooldown_minutes)) then return null; end if;
 select n->>'id' into start_id from jsonb_array_elements(rule.flow->'nodes') n where n->>'type'='start' limit 1;
 if start_id is null then return null; end if;
 insert into public.message_automation_runs(automation_id,company_id,number_id,conversation_id,contact_id,automation_name,incoming_key,received_text,contact_name,flow,node_id)
 values(rule.id,rule.company_id,rule.number_id,conv.id,conv.contact_id,rule.name,message_key,left(coalesce(received_text,''),4000),left(coalesce(nullif(contact_name,''),(select coalesce(saved_name,name,phone,'cliente') from public.contacts where id=conv.contact_id)),200),rule.flow,start_id)
 on conflict(number_id,incoming_key) do nothing returning id into run_id;
 if run_id is not null then insert into workspace_private.message_automation_inputs(number_id,message_key,run_id) values(rule.number_id,message_key,run_id);end if;
 return run_id;
end $$;
revoke all on function public.reserve_message_automation(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_message_automation(uuid,uuid,text,text,text) to service_role;
create function public.resume_message_automation(conversation_id uuid,message_key text,received_text text) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare run public.message_automation_runs; next_id text;
begin
 select r.* into run from public.message_automation_runs r
 join public.message_automations a on a.id=r.automation_id
 join public.conversations c on c.id=r.conversation_id
 where r.conversation_id=resume_message_automation.conversation_id and r.status='waiting_reply' and r.due_at>now()
  and a.enabled and c.status not in ('fechado','cancelado')
  and c.company_id=r.company_id and c.number_id=r.number_id
  and (not a.pause_on_human or (c.assignee_id is null and not coalesce(c.bot_paused,false)))
 order by r.created_at desc limit 1 for update of r skip locked;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(run.number_id::text||message_key,0));
 if exists(select 1 from workspace_private.message_automation_inputs i where i.number_id=run.number_id and i.message_key=resume_message_automation.message_key) then return run.id; end if;
 select e->>'to' into next_id from jsonb_array_elements(run.flow->'edges') e where e->>'from'=run.node_id and e->>'handle'='reply' limit 1;
 if next_id is null then return null; end if;
 insert into workspace_private.message_automation_inputs(number_id,message_key,run_id) values(run.number_id,message_key,run.id);
 update public.message_automation_runs set status='queued',node_id=next_id,received_text=left(coalesce(resume_message_automation.received_text,''),4000),due_at=now() where id=run.id;
 return run.id;
end $$;
revoke all on function public.resume_message_automation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.resume_message_automation(uuid,text,text) to service_role;
create function public.claim_message_automation_run() returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare run public.message_automation_runs;
begin
 update public.message_automation_runs r set status='canceled',error='Automação pausada ou atendimento encerrado/assumido.',finished_at=now()
 where r.status in ('queued','waiting_reply') and (r.automation_id is null or not exists(
  select 1 from public.message_automations a join public.conversations c on c.id=r.conversation_id
  where a.id=r.automation_id and a.enabled and c.status not in ('fechado','cancelado')
   and c.company_id=r.company_id and c.number_id=r.number_id
   and (not a.pause_on_human or (c.assignee_id is null and not coalesce(c.bot_paused,false)))
  ));
 update public.message_automation_runs r set status='queued',node_id=(select e->>'to' from jsonb_array_elements(r.flow->'edges') e where e->>'from'=r.node_id and e->>'handle'='timeout' limit 1),due_at=now() where r.status='waiting_reply' and r.due_at<=now();
 update public.message_automation_runs set status='failed',error='Execução interrompida. O envio pode ter ocorrido; revise a conversa antes de agendar novamente.',finished_at=now() where status='running' and lease_until<now();
 select * into run from public.message_automation_runs where status='queued' and due_at<=now() order by due_at,created_at limit 1 for update skip locked;
 if not found then return null; end if;
 update public.message_automation_runs set status='running',lease_until=now()+interval '10 minutes',lease_token=gen_random_uuid() where id=run.id returning * into run;
 return to_jsonb(run);
end $$;
revoke all on function public.claim_message_automation_run() from public,anon,authenticated;
grant execute on function public.claim_message_automation_run() to service_role;
-- Existing ordinary media uploads keep their policies. Automation recordings are restricted to management in the active company.
create policy automation_audio_scope on storage.objects as restrictive for all to authenticated
 using(name not like 'automations/%' or (bucket_id='wa-media' and (storage.foldername(name))[2]=public.active_company_id()::text and public.my_role() in ('gestor','gerente')))
 with check(name not like 'automations/%' or (bucket_id='wa-media' and (storage.foldername(name))[2]=public.active_company_id()::text and public.my_role() in ('gestor','gerente')));
commit;
