alter table public.customers enable row level security;

drop policy if exists "Enable update access for all users"
on public.customers;

create policy "authenticated staff and admins can update customers"
on public.customers
for update
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.oss_role in ('staff', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.oss_role in ('staff', 'admin')
  )
);
