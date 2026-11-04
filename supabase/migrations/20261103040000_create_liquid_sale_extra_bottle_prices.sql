create table if not exists public.liquid_sale_extra_bottle_prices (
  id uuid primary key default gen_random_uuid(),
  breath_type text not null check (breath_type in ('mtl', 'dtl')),
  sale_kind text not null check (sale_kind in ('event', 'basic')),
  additional_bottle_price integer not null default 0 check (additional_bottle_price >= 0),
  unique (breath_type, sale_kind)
);
alter table public.liquid_sale_extra_bottle_prices enable row level security;
create policy "liquid extra prices readable by authenticated users" on public.liquid_sale_extra_bottle_prices for select to authenticated using (true);
create policy "liquid extra prices managed by admin" on public.liquid_sale_extra_bottle_prices for all to authenticated using (exists (select 1 from public.users where id=auth.uid() and oss_role in ('admin','master'))) with check (exists (select 1 from public.users where id=auth.uid() and oss_role in ('admin','master')));
