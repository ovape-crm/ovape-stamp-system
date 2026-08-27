-- 전표 연결을 위해 임시로 표시되던 UUID 메모는 연결 컬럼으로 대체한다.
update public.comprehensive_settlement_entries
set note = null
where related_receipt_id is not null
  and note ~ '^입고 전표 [0-9a-fA-F-]{36}$';
