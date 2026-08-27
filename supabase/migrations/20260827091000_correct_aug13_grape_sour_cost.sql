-- 2026-08-13 빔버니리유즈 그레이프사워 입고 단가 정정(10,000원 → 4,000원).
-- 입고 원가층과 이미 출고된 FIFO 배정·출고 원가를 같은 기준으로 재계산한다.
do $$
declare v_price integer := 4000;
begin
  update public.inventory_purchase_receipt_lines line
  set unit_price = v_price
  from public.inventory_purchase_receipts receipt
  where receipt.id = line.receipt_id
    and receipt.arrived_on = date '2026-08-13'
    and btrim(line.item_name) = '빔버니리유즈 그레이프사워';

  update public.inventory_purchase_order_lines order_line
  set unit_price = v_price
  from public.inventory_purchase_receipt_lines line
  join public.inventory_purchase_receipts receipt on receipt.id = line.receipt_id
  where order_line.id = line.order_line_id
    and receipt.arrived_on = date '2026-08-13'
    and btrim(line.item_name) = '빔버니리유즈 그레이프사워';

  update public.inventory_cost_layers layer
  set unit_cost = v_price
  from public.inventory_cost_events event
  join public.inventory_purchase_receipt_lines line on line.id::text = event.reference_line_key
  join public.inventory_purchase_receipts receipt on receipt.id = line.receipt_id
  where layer.source_event_id = event.id
    and receipt.arrived_on = date '2026-08-13'
    and btrim(line.item_name) = '빔버니리유즈 그레이프사워';

  update public.inventory_cost_allocations allocation
  set unit_cost = v_price
  from public.inventory_cost_layers layer
  where allocation.source_layer_id = layer.id
    and layer.unit_cost = v_price
    and layer.item_name = '빔버니리유즈 그레이프사워';

  update public.inventory_cost_events event
  set total_cost = totals.amount
  from (
    select allocation.outbound_event_id, sum(allocation.quantity * allocation.unit_cost)::integer as amount
    from public.inventory_cost_allocations allocation
    where allocation.outbound_event_id in (
      select allocation2.outbound_event_id
      from public.inventory_cost_allocations allocation2
      join public.inventory_cost_layers layer on layer.id = allocation2.source_layer_id
      where layer.item_name = '빔버니리유즈 그레이프사워' and layer.unit_cost = v_price
    )
    group by allocation.outbound_event_id
  ) totals
  where event.id = totals.outbound_event_id;
end;
$$;
