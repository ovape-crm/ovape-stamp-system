create table if not exists public.liquid_sale_price_schedules (
  id uuid primary key default gen_random_uuid(),
  breath_type text not null check (breath_type in ('mtl', 'dtl')),
  sale_kind text not null check (sale_kind in ('event', 'basic', 'mixed')),
  one_bottle_price integer not null default 0 check (one_bottle_price >= 0),
  two_bottle_price integer not null default 0 check (two_bottle_price >= 0),
  three_bottle_price integer not null default 0 check (three_bottle_price >= 0),
  additional_bottle_price integer not null default 0 check (additional_bottle_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (breath_type, sale_kind)
);
alter table public.liquid_sale_price_schedules enable row level security;
create policy "liquid sale price schedules readable by authenticated users" on public.liquid_sale_price_schedules for select to authenticated using (true);
create policy "liquid sale price schedules managed by admin" on public.liquid_sale_price_schedules for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master'))) with check (exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')));
