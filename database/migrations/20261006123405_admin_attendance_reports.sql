-- Administrator General may read attendance reports across companies for support.
-- Existing leaders and company managers retain their original company/sector scope.
create policy attendance_sessions_super_admin_read
 on public.attendance_sessions for select to authenticated
 using ((select public.is_super_admin()));
