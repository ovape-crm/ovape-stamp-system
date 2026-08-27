-- 입고 단가를 수정하면 해당 FIFO 원가층과 이미 출고된 배정 원가까지 같은 단가로 동기화한다.
create or replace function public.sync_purchase_receipt_cost_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.unit_price is not distinct from old.unit_price then return new; end if;
  update public.inventory_cost_layers layer
  set unit_cost = new.unit_price, cost_status = case when new.unit_price is null then 'pending' else 'confirmed' end
  from public.inventory_cost_events event
  where layer.source_event_id = event.id
    and event.reference_type = 'purchase_receipt'
    and event.reference_line_key = new.id::text;

  update public.inventory_cost_allocations allocation
  set unit_cost = new.unit_price
  from public.inventory_cost_layers layer
  join public.inventory_cost_events event on event.id = layer.source_event_id
  where allocation.source_layer_id = layer.id
    and event.reference_type = 'purchase_receipt'
    and event.reference_line_key = new.id::text;

  update public.inventory_cost_events outbound
  set total_cost = totals.total_cost
  from (select outbound_event_id, sum(quantity * unit_cost)::integer as total_cost from public.inventory_cost_allocations group by outbound_event_id) totals
  where outbound.id = totals.outbound_event_id;
  return new;
end;
$$;

drop trigger if exists sync_purchase_receipt_cost_edit_trigger on public.inventory_purchase_receipt_lines;
create trigger sync_purchase_receipt_cost_edit_trigger
after update of unit_price on public.inventory_purchase_receipt_lines
for each row execute function public.sync_purchase_receipt_cost_edit();

-- 7월 22일을 포함한 과거 직접 단가 입력도 현재 입고 전표 단가를 기준으로 일괄 정정한다.
update public.inventory_cost_layers layer
set unit_cost = receipt_line.unit_price,
    cost_status = case when receipt_line.unit_price is null then 'pending' else 'confirmed' end
from public.inventory_cost_events event
join public.inventory_purchase_receipt_lines receipt_line on receipt_line.id::text = event.reference_line_key
where layer.source_event_id = event.id
  and event.reference_type = 'purchase_receipt';

update public.inventory_cost_allocations allocation
set unit_cost = layer.unit_cost
from public.inventory_cost_layers layer
where allocation.source_layer_id = layer.id;

update public.inventory_cost_events outbound
set total_cost = totals.total_cost
from (select outbound_event_id, sum(quantity * unit_cost)::integer as total_cost from public.inventory_cost_allocations group by outbound_event_id) totals
where outbound.id = totals.outbound_event_id;
