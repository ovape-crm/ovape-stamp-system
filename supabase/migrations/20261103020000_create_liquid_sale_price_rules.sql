create table if not exists public.liquid_sale_price_rules (
  id uuid primary key default gen_random_uuid(),
  breath_type text not null check (breath_type in ('mtl', 'dtl')),
  event_quantity integer not null default 0 check (event_quantity >= 0),
  basic_quantity integer not null default 0 check (basic_quantity >= 0),
  sale_price integer not null default 0 check (sale_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (breath_type, event_quantity, basic_quantity),
  check (event_quantity + basic_quantity > 0)
);

alter table public.liquid_sale_price_rules enable row level security;

create policy "liquid sale price rules readable by authenticated users"
  on public.liquid_sale_price_rules for select to authenticated using (true);

create policy "liquid sale price rules managed by admin"
  on public.liquid_sale_price_rules for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')))
  with check (exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')));
