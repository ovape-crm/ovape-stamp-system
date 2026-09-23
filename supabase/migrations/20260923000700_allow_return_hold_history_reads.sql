drop policy if exists "master manages return hold processing history" on public.return_hold_processing_history;

create policy "authenticated reads return hold processing history"
  on public.return_hold_processing_history
  for select to authenticated
  using (true);

create policy "master manages return hold processing history"
  on public.return_hold_processing_history
  for all to authenticated
  using (public.is_current_user_master())
  with check (public.is_current_user_master());
