-- Supabase SQL Editor에서 한 번 실행하세요.
create extension if not exists pgcrypto;

create table if not exists public.cash_register_closings (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  opening_cash integer not null default 0 check (opening_cash >= 0),
  cash_in integer not null default 0 check (cash_in >= 0),
  cash_out integer not null default 0 check (cash_out >= 0),
  ovape_cash_sales integer not null default 0,
  egu_cash_sales integer not null default 0,
  expected_cash integer not null default 0,
  actual_cash integer not null default 0 check (actual_cash >= 0),
  cash_counts jsonb not null default '{}'::jsonb,
  work_shifts jsonb not null default '[]'::jsonb,
  worker_name text not null default '',
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cash_register_closings enable row level security;

drop policy if exists "authenticated users can read cash closings"
  on public.cash_register_closings;
create policy "authenticated users can read cash closings"
  on public.cash_register_closings for select
  to authenticated using (true);

drop policy if exists "authenticated users can insert cash closings"
  on public.cash_register_closings;
create policy "authenticated users can insert cash closings"
  on public.cash_register_closings for insert
  to authenticated with check (created_by = auth.uid());

drop policy if exists "authenticated users can update cash closings"
  on public.cash_register_closings;
create policy "authenticated users can update cash closings"
  on public.cash_register_closings for update
  to authenticated using (true) with check (true);

create index if not exists cash_register_closings_business_date_idx
  on public.cash_register_closings (business_date desc);

-- 이미 시재 테이블을 만든 뒤 이 기능을 추가한 경우에도 적용됩니다.
alter table public.cash_register_closings
  add column if not exists work_shifts jsonb not null default '[]'::jsonb,
  add column if not exists ovape_cash_sales integer not null default 0,
  add column if not exists egu_cash_sales integer not null default 0,
  add column if not exists expected_cash integer not null default 0;
