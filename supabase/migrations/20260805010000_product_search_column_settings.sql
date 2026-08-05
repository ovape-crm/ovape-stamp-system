create table if not exists public.product_search_column_settings (
  search_mode text primary key check (search_mode in ('liquid', 'other')),
  column_widths jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

alter table public.product_search_column_settings enable row level security;

drop policy if exists "authenticated users can read product search column settings"
on public.product_search_column_settings;
create policy "authenticated users can read product search column settings"
on public.product_search_column_settings for select
to authenticated
using (true);

drop policy if exists "admins can save product search column settings"
on public.product_search_column_settings;
create policy "admins can save product search column settings"
on public.product_search_column_settings for all
to authenticated
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid() and users.oss_role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid() and users.oss_role = 'admin'
  )
);
