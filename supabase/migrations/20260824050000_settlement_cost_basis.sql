create table if not exists public.settlement_item_cost_bases (
  id uuid primary key default gen_random_uuid(),
  item_id bigint,
  item_name text not null,
  basis_type text not null check (basis_type in ('historical', 'opening_20260722')),
  quantity integer not null check (quantity > 0),
  unit_cost integer not null check (unit_cost >= 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_name, basis_type, sort_order)
);

create table if not exists public.settlement_historical_purchases (
  id uuid primary key default gen_random_uuid(),
  order_date date not null,
  store text not null check (store in ('ovape', 'eguvape', 'other')),
  invoice_type text not null check (invoice_type in ('tax_invoice', 'cash_receipt', 'x')),
  supplier_id uuid not null references public.inventory_suppliers(id),
  total_amount integer not null check (total_amount >= 0),
  purchase_amount integer not null default 0 check (purchase_amount >= 0),
  supplier_discount integer not null default 0 check (supplier_discount >= 0),
  wholesale_shipping_fee integer not null default 0 check (wholesale_shipping_fee >= 0),
  points_used integer not null default 0 check (points_used >= 0),
  paid_amount integer not null default 0 check (paid_amount >= 0),
  note text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists settlement_historical_purchases_order_date_idx
  on public.settlement_historical_purchases (order_date desc);

alter table public.settlement_item_cost_bases enable row level security;
alter table public.settlement_historical_purchases enable row level security;
grant select, insert, update, delete on public.settlement_item_cost_bases to authenticated;
grant select, insert, update, delete on public.settlement_historical_purchases to authenticated;
revoke all on public.settlement_item_cost_bases from anon;
revoke all on public.settlement_historical_purchases from anon;

drop policy if exists "master manages settlement item costs" on public.settlement_item_cost_bases;
create policy "master manages settlement item costs"
on public.settlement_item_cost_bases for all to authenticated
using (exists (select 1 from public.users where id = auth.uid() and oss_role in ('master', 'admin')))
with check (created_by = auth.uid() and exists (select 1 from public.users where id = auth.uid() and oss_role in ('master', 'admin')));

-- Compatibility when this file is reapplied after the first draft.
alter table public.settlement_item_cost_bases
  drop constraint if exists settlement_item_cost_bases_item_id_fkey,
  drop constraint if exists settlement_item_cost_bases_item_id_basis_type_key,
  drop constraint if exists settlement_item_cost_bases_item_name_basis_type_key,
  alter column item_id drop not null;
drop index if exists public.settlement_item_cost_bases_item_name_basis_type_idx;
create unique index if not exists settlement_item_cost_bases_item_name_basis_type_order_idx
  on public.settlement_item_cost_bases (item_name, basis_type, sort_order);

drop policy if exists "master manages historical purchases" on public.settlement_historical_purchases;
create policy "master manages historical purchases"
on public.settlement_historical_purchases for all to authenticated
using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'))
with check (created_by = auth.uid() and exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'));
