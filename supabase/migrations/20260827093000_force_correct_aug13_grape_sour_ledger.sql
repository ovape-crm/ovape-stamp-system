-- 2026-08-13(한국 시간) 빔버니리유즈 그레이프사워 10개 입고의 원장 표시·FIFO 배정까지 4,000원으로 강제 정정한다.
do $$
declare v_price integer := 4000;
begin
  update public.inventory_cost_layers layer
  set unit_cost = v_price, cost_status = 'confirmed'
  from public.inventory_cost_events event
  where layer.source_event_id = event.id
    and event.event_type = 'purchase_in'
    and btrim(event.item_name) = '빔버니리유즈 그레이프사워'
    and event.event_at >= timestamptz '2026-08-12 15:00:00+00'
    and event.event_at < timestamptz '2026-08-13 15:00:00+00';

  update public.inventory_cost_events event
  set total_cost = event.quantity * v_price
  where event.event_type = 'purchase_in'
    and btrim(event.item_name) = '빔버니리유즈 그레이프사워'
    and event.event_at >= timestamptz '2026-08-12 15:00:00+00'
    and event.event_at < timestamptz '2026-08-13 15:00:00+00';

  update public.inventory_cost_allocations allocation
  set unit_cost = v_price
  from public.inventory_cost_layers layer
  where allocation.source_layer_id = layer.id
    and btrim(layer.item_name) = '빔버니리유즈 그레이프사워'
    and layer.unit_cost = v_price;

  update public.inventory_cost_events outbound
  set total_cost = totals.total_cost
  from (select outbound_event_id, sum(quantity * unit_cost)::integer as total_cost from public.inventory_cost_allocations group by outbound_event_id) totals
  where outbound.id = totals.outbound_event_id;
end;
$$;
