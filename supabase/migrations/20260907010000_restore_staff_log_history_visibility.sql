-- Staff, admins, and masters need to see the complete operational history.
-- Remove the inventory-adjustment-only restriction and restore regular log reads.
alter table public.logs enable row level security;

grant select on public.logs to authenticated;

drop policy if exists "master only reads inventory adjustment logs" on public.logs;
drop policy if exists "staff, admins, and masters read logs" on public.logs;
create policy "staff, admins, and masters read logs"
on public.logs
for select
to authenticated
using (
  exists (
    select 1
    from public.users app_user
    where app_user.id = auth.uid()
      and app_user.oss_role in ('staff', 'admin', 'master')
  )
);
