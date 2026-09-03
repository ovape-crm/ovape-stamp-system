-- Read-only detail view of pre-existing mismatches. No data correction is performed.
with usage as (
  select a.source_layer_id,
    coalesce(sum(a.quantity) filter(where e.metadata->>'restoredAt' is null),0) active_quantity,
    coalesce(sum(a.quantity) filter(where e.metadata->>'restoredAt' is not null),0) restored_quantity
  from inventory_cost_allocations a join inventory_cost_events e on e.id=a.outbound_event_id group by a.source_layer_id
), transfers as (
  select l.source_layer_id,sum(l.original_quantity) quantity from inventory_cost_layers l
  join inventory_cost_events e on e.id=l.source_event_id where e.metadata->>'manualZeroCost'='true' group by l.source_layer_id
), layers as (
  select l.id,l.item_name,l.original_quantity,l.remaining_quantity,l.unit_cost,u.active_quantity,u.restored_quantity,
    e.event_type,e.reference_type,e.reference_id,e.reference_line_key,coalesce(t.quantity,0) transferred_quantity
  from inventory_cost_layers l join inventory_cost_events e on e.id=l.source_event_id left join usage u on u.source_layer_id=l.id
  left join transfers t on t.source_layer_id=l.id
  where l.original_quantity-l.remaining_quantity<>coalesce(u.active_quantity,0)+coalesce(t.quantity,0)
), stock as (
  select coalesce(b.item_name,l.item_name) item_name,b.quantity stock_quantity,l.quantity layer_quantity
  from inventory_balances b full join (select item_name,sum(remaining_quantity) quantity from inventory_cost_layers group by item_name) l on l.item_name=b.item_name
  where coalesce(b.quantity,0)<>coalesce(l.quantity,0) and public.is_inventory_item_tracked(coalesce(b.item_name,l.item_name))
)
select (select jsonb_agg(to_jsonb(l)) from layers l) layer_mismatches,
  (select jsonb_agg(to_jsonb(s)) from stock s) stock_mismatches;
