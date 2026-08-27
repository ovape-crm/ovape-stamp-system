alter table public.comprehensive_settlement_entries
  add column if not exists related_receipt_id uuid;

create index if not exists comprehensive_settlement_related_receipt_idx
  on public.comprehensive_settlement_entries(related_receipt_id)
  where related_receipt_id is not null;

-- 기존 화면에서 전표 UUID를 메모로 저장했던 잔금/지급 내역을 전표 연결 데이터로 복구한다.
update public.comprehensive_settlement_entries
set related_receipt_id = substring(note from '입고 전표 ([0-9a-fA-F-]{36})')::uuid
where related_receipt_id is null
  and entry_type in ('balance', 'payment')
  and note ~ '^입고 전표 [0-9a-fA-F-]{36}$';
