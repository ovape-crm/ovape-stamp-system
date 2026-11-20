create table if not exists public.product_search_filter_settings (
  id smallint primary key default 1 check (id = 1),
  usage_filter text not null default 'used' check (usage_filter in ('all', 'used', 'unused')),
  show_sold_out boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

insert into public.product_search_filter_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.product_search_filter_settings enable row level security;

create policy "authenticated users can read product search filter settings"
on public.product_search_filter_settings for select to authenticated
using (true);

create policy "masters can save product search filter settings"
on public.product_search_filter_settings for all to authenticated
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid() and users.oss_role = 'master'
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid() and users.oss_role = 'master'
  )
);
