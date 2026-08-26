create or replace function public.resolve_inventory_cost_pending_layers(
  p_item_name text,
  p_basis_type text,
  p_unit_cost integer
) returns integer
language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if p_basis_type not in ('historical','opening_20260722') or p_unit_cost is null or p_unit_cost<0 then raise exception 'INVALID_COST'; end if;
  update public.inventory_cost_layers layer set unit_cost=p_unit_cost,cost_status='confirmed'
  from public.inventory_cost_events source_event
  where source_event.id=layer.source_event_id and layer.item_name=btrim(p_item_name) and layer.cost_status='pending'
    and ((p_basis_type='historical' and source_event.event_at<'2026-07-22 00:00:00+09')
      or (p_basis_type='opening_20260722' and source_event.event_at>='2026-07-22 00:00:00+09'));
  get diagnostics v_count=row_count;
  update public.inventory_cost_allocations allocation set unit_cost=layer.unit_cost
  from public.inventory_cost_layers layer
  where layer.id=allocation.source_layer_id and allocation.unit_cost is null and layer.cost_status='confirmed';
  update public.inventory_cost_events event set total_cost=summary.total_cost
  from (
    select allocation.outbound_event_id,sum(allocation.quantity*allocation.unit_cost)::integer total_cost
    from public.inventory_cost_allocations allocation group by allocation.outbound_event_id
    having count(*) filter(where allocation.unit_cost is null)=0
  ) summary where event.id=summary.outbound_event_id and event.total_cost is null;
  update public.inventory_cost_events event set total_cost=layer.original_quantity*layer.unit_cost
  from public.inventory_cost_layers layer where layer.source_event_id=event.id and event.total_cost is null and layer.unit_cost is not null;
  return v_count;
end $$;
revoke all on function public.resolve_inventory_cost_pending_layers(text,text,integer) from public,anon;
grant execute on function public.resolve_inventory_cost_pending_layers(text,text,integer) to authenticated;
