-- Read-only production diagnostics. Never repairs or reassigns inventory/costs.
with layer_totals as (
  select item_name,sum(remaining_quantity) quantity from public.inventory_cost_layers group by item_name
), allocation_totals as (
  select a.outbound_event_id,sum(a.quantity) quantity,
    case when bool_or(a.unit_cost is null) then null else sum(a.quantity::bigint*a.unit_cost) end total_cost
  from public.inventory_cost_allocations a group by a.outbound_event_id
), active_usage as (
  select a.source_layer_id,sum(a.quantity) quantity from public.inventory_cost_allocations a
  join public.inventory_cost_events e on e.id=a.outbound_event_id where e.metadata->>'restoredAt' is null group by a.source_layer_id
), transfers as (
  select l.source_layer_id,sum(l.original_quantity) quantity from inventory_cost_layers l
  join inventory_cost_events e on e.id=l.source_event_id where e.metadata->>'manualZeroCost'='true' group by l.source_layer_id
)
select
  (select count(*) from public.inventory_balances b full join layer_totals l on l.item_name=b.item_name
    where coalesce(b.quantity,0)<>coalesce(l.quantity,0) and public.is_inventory_item_tracked(coalesce(b.item_name,l.item_name))) stock_layer_mismatch_items,
  (select count(*) from public.inventory_cost_layers l left join active_usage a on a.source_layer_id=l.id left join transfers t on t.source_layer_id=l.id
    where l.original_quantity-l.remaining_quantity<>coalesce(a.quantity,0)+coalesce(t.quantity,0)) layer_allocation_mismatches,
  (select count(*) from public.inventory_cost_events e left join allocation_totals a on a.outbound_event_id=e.id
    where e.direction='out' and e.metadata->>'restoredAt' is null and e.quantity<>coalesce(a.quantity,0)) outbound_quantity_mismatches,
  (select count(*) from public.inventory_cost_events e join allocation_totals a on a.outbound_event_id=e.id
    where e.direction='out' and e.metadata->>'restoredAt' is null and e.total_cost is distinct from a.total_cost) outbound_cost_mismatches,
  (select count(*) from public.logs log cross join lateral jsonb_array_elements(coalesce(log.jsonb->'items','[]')) with ordinality i(value,n)
    where log.category='stamp' and btrim(coalesce(i.value->>'inventoryAction','')) in ('','out')
      and btrim(coalesce(i.value->>'remark','')) ~ '^서비스($|[,\s(])'
      and coalesce(nullif(i.value->>'quantity','')::integer,0)>0 and public.is_inventory_item_tracked(btrim(i.value->>'itemName'))
      and not exists(select 1 from public.inventory_cost_events e where e.reference_type='stamp_log' and e.reference_id=log.id::text and e.reference_line_key=i.n::text)) service_lines_without_cost,
  (select count(*) from public.after_service_outbound_cost_allocations where source_receipt_line_id is not null) service_receipt_links;
