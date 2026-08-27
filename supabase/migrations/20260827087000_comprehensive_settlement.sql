create table if not exists public.comprehensive_settlement_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('receipt', 'balance', 'payment')),
  item_name text,
  quantity integer,
  unit_price integer,
  amount integer not null check (amount >= 0),
  payment_method text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

alter table public.comprehensive_settlement_entries enable row level security;
create policy "master manages comprehensive settlement" on public.comprehensive_settlement_entries
  for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'))
  with check (exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'));
