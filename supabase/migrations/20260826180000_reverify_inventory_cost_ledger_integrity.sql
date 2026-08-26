do $$
begin
  if exists (
    select 1 from public.inventory_cost_layers
    where remaining_quantity < 0
       or remaining_quantity > original_quantity
  ) then raise exception 'COST_LEDGER_INVALID_LAYER_QUANTITY'; end if;

  if exists (
    select 1
    from public.inventory_cost_layers layer
    left join public.inventory_cost_allocations allocation
      on allocation.source_layer_id = layer.id
    group by layer.id, layer.original_quantity
    having coalesce(sum(allocation.quantity), 0) > layer.original_quantity
  ) then raise exception 'COST_LEDGER_OVER_ALLOCATED_SOURCE'; end if;

  if exists (
    select 1
    from public.inventory_cost_events event
    left join public.inventory_cost_allocations allocation
      on allocation.outbound_event_id = event.id
    where event.direction = 'out'
    group by event.id, event.quantity
    having coalesce(sum(allocation.quantity), 0) <> event.quantity
  ) then raise exception 'COST_LEDGER_OUTBOUND_ALLOCATION_MISMATCH'; end if;

  if exists (
    select 1
    from public.inventory_cost_events event
    join public.inventory_cost_allocations allocation
      on allocation.outbound_event_id = event.id
    group by event.id, event.total_cost
    having count(*) filter (where allocation.unit_cost is null) = 0
       and event.total_cost is distinct from
         sum(allocation.quantity * allocation.unit_cost)::integer
  ) then raise exception 'COST_LEDGER_TOTAL_COST_MISMATCH'; end if;
end $$;
