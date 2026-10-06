begin;
-- Run after the migration in a transaction, then ROLLBACK. No production data is changed.
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','workflow-a@example.invalid'),
 ('10000000-0000-0000-0000-000000000002','workflow-b@example.invalid'),
 ('10000000-0000-0000-0000-000000000003','workflow-leader@example.invalid'),
 ('10000000-0000-0000-0000-000000000004','workflow-outsider@example.invalid'),
 ('10000000-0000-0000-0000-000000000005','workflow-owner@example.invalid'),
 ('10000000-0000-0000-0000-000000000006','workflow-other-leader@example.invalid'),
 ('10000000-0000-0000-0000-000000000007','workflow-designated-leader@example.invalid');
insert into public.companies(id,name,company_code) values
 ('20000000-0000-0000-0000-000000000001','Workflow fixture','WFTEST01'),
 ('20000000-0000-0000-0000-000000000002','Other fixture','WFTEST02');
insert into public.sectors(id,name,company_id) values
 ('30000000-0000-0000-0000-000000000001','Support','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','Sales','20000000-0000-0000-0000-000000000001');
insert into public.profiles(id,email,full_name,role,company_id,sector_id) values
 ('10000000-0000-0000-0000-000000000001','workflow-a@example.invalid','A','funcionario','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','workflow-b@example.invalid','B','funcionario','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000003','workflow-leader@example.invalid','Leader','gerente','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000004','workflow-outsider@example.invalid','Outsider','gestor','20000000-0000-0000-0000-000000000002',null),
 ('10000000-0000-0000-0000-000000000005','workflow-owner@example.invalid','Owner','gestor','20000000-0000-0000-0000-000000000001',null),
 ('10000000-0000-0000-0000-000000000006','workflow-other-leader@example.invalid','Sales leader','gerente','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000007','workflow-designated-leader@example.invalid','Designated leader','funcionario','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')
on conflict(id) do update set role=excluded.role,company_id=excluded.company_id,sector_id=excluded.sector_id;
update public.sectors set leader_id='10000000-0000-0000-0000-000000000007' where id='30000000-0000-0000-0000-000000000001';
insert into public.contacts(id,company_id,phone,name) values ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','550000000001','Client');
insert into public.conversations(protocol,id,company_id,contact_id,sector_id,status) values (900000000001,'50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','espera');

insert into public.whatsapp_numbers(id,label,company_id,sector_id) values('60000000-0000-0000-0000-000000000001','Automation fixture','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
update public.conversations set number_id='60000000-0000-0000-0000-000000000001' where id='50000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
insert into public.message_automations(id,company_id,number_id,name,enabled,match_mode,flow,created_by) values
('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Fixture flow',true,'any',
'{"nodes":[{"id":"s","type":"start"},{"id":"t","type":"text","data":{"text":"Hello"}},{"id":"w","type":"reply","data":{"minutes":1}},{"id":"e","type":"end"}],"edges":[{"from":"s","to":"t","handle":"out"},{"from":"t","to":"w","handle":"out"},{"from":"w","to":"e","handle":"reply"},{"from":"w","to":"e","handle":"timeout"}]}','10000000-0000-0000-0000-000000000005');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ declare n integer; begin
 update public.message_automations set name='Employee edit' where id='70000000-0000-0000-0000-000000000001';get diagnostics n=row_count;if n<>0 then raise exception 'Employee can edit rules';end if;
 if has_function_privilege('authenticated','public.reserve_message_automation(uuid,uuid,text,text,text)','EXECUTE') then raise exception 'Employee can enqueue';end if;
 if has_function_privilege('anon','public.claim_message_automation_run()','EXECUTE') then raise exception 'Anonymous worker access';end if;
 if not exists(select 1 from public.message_automations where id='70000000-0000-0000-0000-000000000001') then raise exception 'Employee cannot see rules';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
do $$ begin if exists(select 1 from public.message_automations where id='70000000-0000-0000-0000-000000000001') then raise exception 'Company isolation failed';end if;end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare r uuid;claimed jsonb;begin
 r=public.reserve_message_automation('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','fixture-wa-1','Hi','Ana');
 if r is null then raise exception 'Reservation failed';end if;
 if public.reserve_message_automation('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','fixture-wa-1','Hi','Ana') is not null then raise exception 'Duplicate reserved';end if;
 if public.reserve_message_automation('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','fixture-wa-2','Hi','Ana') is not null then raise exception 'Cooldown ignored';end if;
 claimed=public.claim_message_automation_run();if claimed->>'id'<>r::text or claimed->>'status'<>'running' then raise exception 'Claim failed';end if;
 update public.message_automation_runs set status='waiting_reply',node_id='w',due_at=now()+interval '1 hour',lease_token=null where id=r;
 perform public.resume_message_automation('50000000-0000-0000-0000-000000000001','fixture-wa-1','duplicate');
 if (select status from public.message_automation_runs where id=r)<>'waiting_reply' then raise exception 'Original incoming repeated as reply';end if;
 perform public.resume_message_automation('50000000-0000-0000-0000-000000000001','fixture-reply-1','financeiro');
 if not exists(select 1 from public.message_automation_runs where id=r and status='queued' and node_id='e' and received_text='financeiro') then raise exception 'Reply did not advance';end if;
 update public.message_automation_runs set status='waiting_reply',node_id='w',due_at=now()+interval '1 hour' where id=r;
 perform public.resume_message_automation('50000000-0000-0000-0000-000000000001','fixture-reply-1','duplicate');
 if (select status from public.message_automation_runs where id=r)<>'waiting_reply' then raise exception 'Reply replay advanced twice';end if;
 update public.message_automation_runs set due_at=now()-interval '1 second' where id=r;
 claimed=public.claim_message_automation_run();if claimed->>'node_id'<>'e' then raise exception 'Reply timeout did not advance';end if;
 update public.message_automation_runs set lease_until=now()-interval '1 second' where id=r;
 perform public.claim_message_automation_run();if (select status from public.message_automation_runs where id=r)<>'failed' then raise exception 'Crashed job would resend';end if;
 update public.message_automation_runs set status='waiting_reply',node_id='w',due_at=now()+interval '1 hour' where id=r;
 update public.message_automations set enabled=false where id='70000000-0000-0000-0000-000000000001';
 perform public.claim_message_automation_run();if (select status from public.message_automation_runs where id=r)<>'canceled' then raise exception 'Paused workflow not canceled';end if;
end $$;
insert into public.message_automations(id,company_id,number_id,name,enabled,trigger_type,match_mode,scheduled_at,target_conversation_id,pause_on_human,flow)
select '70000000-0000-0000-0000-000000000002',company_id,number_id,'Schedule fixture',true,'scheduled','any',now()+interval '1 hour','50000000-0000-0000-0000-000000000001',false,flow from public.message_automations where id='70000000-0000-0000-0000-000000000001';
do $$ declare r uuid; begin
 if public.reserve_message_automation('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','scheduled:70000000-0000-0000-0000-000000000002:future','','') is not null then raise exception 'Scheduled message sent early';end if;
 update public.message_automations set scheduled_at=now()-interval '1 second' where id='70000000-0000-0000-0000-000000000002';
 r=public.reserve_message_automation('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','scheduled:70000000-0000-0000-0000-000000000002:due','','');
 if r is null then raise exception 'Due schedule blocked';end if;
 if public.reserve_message_automation('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','scheduled:70000000-0000-0000-0000-000000000002:due','','') is not null then raise exception 'Schedule duplicated';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ begin if exists(select 1 from public.message_automation_runs where company_id='20000000-0000-0000-0000-000000000001') then raise exception 'Employee can read execution logs';end if;end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.message_automation_runs where company_id='20000000-0000-0000-0000-000000000001')<>2 then raise exception 'Manager cannot see executions';end if;end $$;
reset role;
select 'PASS: roles, isolation, enqueue, duplicate protection, cooldown, reply, replay protection, timeout, restart, pause and schedules' as verification;
rollback;
