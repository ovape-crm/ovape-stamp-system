-- 일회성 구글시트 고객 정리 작업대. 실제 고객/판매 이력에는 반영하지 않는다.
create table if not exists public.customer_sheet_import_batches (
  id uuid primary key default gen_random_uuid(),
  title text not null default '구글시트 고객 정리',
  source_label text not null default '',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_sheet_import_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.customer_sheet_import_batches(id) on delete cascade,
  source_row_number integer not null,
  store_name text not null default '',
  sold_at_text text not null default '',
  item_name text not null default '',
  paid_amount_text text not null default '',
  payment_method text not null default '',
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_note text not null default '',
  customer_address text not null default '',
  review_status text not null default 'pending' check (review_status in ('pending','matched','new_customer','hold','applied')),
  selected_customer_id bigint references public.customers(id),
  review_note text not null default '',
  proposed_changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, source_row_number)
);

create index if not exists customer_sheet_import_rows_batch_status_idx
  on public.customer_sheet_import_rows(batch_id, review_status, source_row_number);
create index if not exists customer_sheet_import_rows_phone_idx
  on public.customer_sheet_import_rows(batch_id, customer_phone);

alter table public.customer_sheet_import_batches enable row level security;
alter table public.customer_sheet_import_rows enable row level security;

create policy "admin and master manage customer sheet import batches"
  on public.customer_sheet_import_batches for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin','master')))
  with check (exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin','master')));

create policy "admin and master manage customer sheet import rows"
  on public.customer_sheet_import_rows for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin','master')))
  with check (exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin','master')));
