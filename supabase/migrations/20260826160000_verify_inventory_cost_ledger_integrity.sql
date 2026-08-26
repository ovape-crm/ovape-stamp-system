do $$
begin
  if exists (
    select 1 from public.inventory_cost_layers layer
    where layer.remaining_quantity<0 or layer.remaining_quantity>layer.original_quantity
  ) then raise exception 'COST_LEDGER_INVALID_LAYER_QUANTITY'; end if;
  if exists (
    select 1 from public.inventory_cost_layers layer
    left join public.inventory_cost_allocations allocation on allocation.source_layer_id=layer.id
    group by layer.id,layer.original_quantity
    having coalesce(sum(allocation.quantity),0)>layer.original_quantity
  ) then raise exception 'COST_LEDGER_OVER_ALLOCATED_SOURCE'; end if;
  if exists (
    select 1 from public.inventory_cost_events event
    left join public.inventory_cost_allocations allocation on allocation.outbound_event_id=event.id
    where event.direction='out'
    group by event.id,event.quantity
    having coalesce(sum(allocation.quantity),0)<>event.quantity
  ) then raise exception 'COST_LEDGER_OUTBOUND_ALLOCATION_MISMATCH'; end if;
  if exists (
    select 1 from public.inventory_cost_events event
    join public.inventory_cost_allocations allocation on allocation.outbound_event_id=event.id
    group by event.id,event.total_cost
    having count(*) filter(where allocation.unit_cost is null)=0
      and event.total_cost is distinct from sum(allocation.quantity*allocation.unit_cost)::integer
  ) then raise exception 'COST_LEDGER_TOTAL_COST_MISMATCH'; end if;
end $$;

create or replace function public.get_inventory_cost_ledger_audit()
returns table(event_count bigint,layer_count bigint,pending_layer_count bigint,pending_sale_count bigint)
language sql stable security definer set search_path=public as $$
  select
    (select count(*) from public.inventory_cost_events),
    (select count(*) from public.inventory_cost_layers),
    (select count(*) from public.inventory_cost_layers where cost_status='pending'),
    (select count(*) from public.inventory_cost_events where event_type='sale_out' and total_cost is null)
  where exists(select 1 from public.users where id=auth.uid() and oss_role='master');
$$;
revoke all on function public.get_inventory_cost_ledger_audit() from public,anon;
grant execute on function public.get_inventory_cost_ledger_audit() to authenticated;
