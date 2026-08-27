-- 검토 전 즉시 저장된 종합 입고 전표는 정산 확정 데이터가 아니므로 모두 원복한다.
delete from public.comprehensive_settlement_entries
where source_receipt_id is not null;
