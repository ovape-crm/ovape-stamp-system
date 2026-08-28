-- 기존 A/S 2건의 실제 원가는 확인되지 않았으므로 0원으로 추정하지 않는다.
-- 사용자가 원가를 입력할 수 있도록 원래 미배정 상태로 되돌린다.
delete from public.after_service_outbound_cost_allocations
where after_service_id in (187, 190)
  and source_receipt_line_id is null
  and unit_price = 0
  and outbound_quantity = 1
  and received_quantity = 0;

update public.after_services
set service_case_type = 'customer_as',
    outbound_supplier_id = null,
    outbound_processed_at = null
where id in (187, 190)
  and status = 'sent_for_repair';
