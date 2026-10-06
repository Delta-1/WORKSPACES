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
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.attendance_action('50000000-0000-0000-0000-000000000001','claim');
insert into public.whatsapp_messages(conversation_id,company_id,direction,sender_id,text) values ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','out','10000000-0000-0000-0000-000000000001','Hello');
do $$ begin if exists(select 1 from public.attendance_sessions) then raise exception 'Employee can read own report'; end if; end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.attendance_sessions where outgoing_count=1 and first_response_at is not null and ended_at is null) then raise exception 'Response tracking failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.attendance_action('50000000-0000-0000-0000-000000000001','claim');raise exception 'TEST: double claim allowed';
 exception when others then if sqlerrm='TEST: double claim allowed' then raise; end if; end;
 begin update public.conversations set assignee_id=auth.uid() where id='50000000-0000-0000-0000-000000000001';raise exception 'TEST: takeover allowed';
 exception when others then if sqlerrm='TEST: takeover allowed' then raise; end if; end;
 begin insert into public.whatsapp_messages(conversation_id,company_id,direction,sender_id,text) values ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','out',auth.uid(),'Unauthorized');raise exception 'TEST: send allowed';
 exception when others then if sqlerrm='TEST: send allowed' then raise; end if; end;
 if exists(select 1 from public.attendance_sessions) then raise exception 'Employee can read other reports'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.attendance_sessions where company_id='20000000-0000-0000-0000-000000000001')<>1 then raise exception 'Leader cannot supervise sector'; end if; end $$;
select public.attendance_action('50000000-0000-0000-0000-000000000001','transfer','10000000-0000-0000-0000-000000000002',null,'Escalated');
do $$ begin
 if (select count(*) from public.attendance_sessions where company_id='20000000-0000-0000-0000-000000000001')<>2 then raise exception 'Transfer lost history'; end if;
 if not exists(select 1 from public.attendance_sessions where outcome='transferred' and outgoing_count=1 and note='Escalated') then raise exception 'Transfer snapshot failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ begin
 begin perform public.attendance_action('50000000-0000-0000-0000-000000000001','finish');raise exception 'TEST: missing resolution allowed';
 exception when others then if sqlerrm='TEST: missing resolution allowed' then raise; end if; end;
end $$;
select public.attendance_action('50000000-0000-0000-0000-000000000001','finish',null,'resolved',null);
select public.attendance_action('50000000-0000-0000-0000-000000000001','claim');
do $$ begin if exists(select 1 from public.attendance_sessions) then raise exception 'Employee can read own completed report'; end if; end $$;
reset role;
do $$ begin if (select count(*) from public.attendance_sessions where company_id='20000000-0000-0000-0000-000000000001')<>3 then raise exception 'Reopen erased completed session'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.attendance_sessions where company_id='20000000-0000-0000-0000-000000000001')<>3 then raise exception 'Manager cannot read company reports'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}',true);
do $$ begin if exists(select 1 from public.attendance_sessions) then raise exception 'Leader can read another sector'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.attendance_sessions where company_id='20000000-0000-0000-0000-000000000001')<>3 then raise exception 'Designated sector leader cannot read reports'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.attendance_sessions) or exists(select 1 from public.contacts) then raise exception 'Company isolation failed'; end if;
 begin perform public.attendance_action('50000000-0000-0000-0000-000000000001','claim');raise exception 'TEST: cross-company claim allowed';
 exception when others then if sqlerrm='TEST: cross-company claim allowed' then raise; end if; end;
end $$;
reset role;
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000000008','workflow-super-admin@example.invalid');
insert into public.profiles(id,email,full_name,role,company_id) values ('10000000-0000-0000-0000-000000000008','workflow-super-admin@example.invalid','Global admin','gestor','20000000-0000-0000-0000-000000000002')
on conflict(id) do update set role=excluded.role,company_id=excluded.company_id;
insert into public.super_admins(email) values ('workflow-super-admin@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.attendance_sessions where company_id='20000000-0000-0000-0000-000000000001')<>3 then raise exception 'Administrator cannot read another company report'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
do $$ begin if exists(select 1 from public.attendance_sessions where company_id='20000000-0000-0000-0000-000000000001') then raise exception 'Company manager gained global report access'; end if; end $$;
reset role;
select 'PASS: claim, duplicate claim denial, send ownership, sector supervision, transfer, resolution, reopen, reports restricted to leadership, administrator global reports, isolation' as verification;
