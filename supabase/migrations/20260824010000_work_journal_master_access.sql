-- Master is the highest role and must inherit every admin permission.
drop policy if exists "admins can insert workers"
  on public.work_journal_workers;
create policy "admins can insert workers"
  on public.work_journal_workers for insert
  to authenticated with check (
    created_by = auth.uid() and public.has_admin_access()
  );

drop policy if exists "admins can update workers"
  on public.work_journal_workers;
create policy "admins can update workers"
  on public.work_journal_workers for update
  to authenticated
  using (public.has_admin_access())
  with check (public.has_admin_access());

drop policy if exists "admins can read worker private details"
  on public.work_journal_worker_private;
create policy "admins can read worker private details"
  on public.work_journal_worker_private for select
  to authenticated using (public.has_admin_access());

drop policy if exists "admins can insert worker private details"
  on public.work_journal_worker_private;
create policy "admins can insert worker private details"
  on public.work_journal_worker_private for insert
  to authenticated with check (public.has_admin_access());

drop policy if exists "admins can update worker private details"
  on public.work_journal_worker_private;
create policy "admins can update worker private details"
  on public.work_journal_worker_private for update
  to authenticated
  using (public.has_admin_access())
  with check (public.has_admin_access());
