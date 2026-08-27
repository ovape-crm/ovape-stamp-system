alter table public.comprehensive_settlement_entries add column if not exists source_receipt_id uuid;
create unique index if not exists comprehensive_settlement_receipt_unique on public.comprehensive_settlement_entries(source_receipt_id) where source_receipt_id is not null;
