create table if not exists public.settlement_historical_transactions (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  store text not null check (store in ('ovape', 'eguvape')),
  raw_type text not null,
  memo text,
  purchase_cost integer not null,
  sales_amount integer not null,
  profit integer not null,
  classification text not null check (classification in (
    'payment_sale', 'demo', 'historical_exchange_unspecified',
    'coupon_redemption', 'service', 'operating_expense', 'delivery_expense'
  )),
  payment_type text,
  source_batch_id text not null,
  source_row integer not null check (source_row >= 2),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (source_batch_id, source_row)
);

create index if not exists settlement_historical_transactions_date_idx
  on public.settlement_historical_transactions (business_date, id);

alter table public.settlement_historical_transactions enable row level security;
grant select, insert, update, delete on public.settlement_historical_transactions to authenticated;
revoke all on public.settlement_historical_transactions from anon;

drop policy if exists "master manages historical settlement transactions"
  on public.settlement_historical_transactions;
create policy "master manages historical settlement transactions"
on public.settlement_historical_transactions for all to authenticated
using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'))
with check (
  created_by = auth.uid()
  and exists (select 1 from public.users where id = auth.uid() and oss_role = 'master')
);

notify pgrst, 'reload schema';
