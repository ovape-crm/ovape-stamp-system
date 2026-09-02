create or replace function public.update_inventory_cost_layer_unit_cost(p_layer_id uuid, p_unit_cost integer, p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_layer public.inventory_cost_layers%rowtype;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'INVALID_UNIT_COST'; end if;
  select * into v_layer from public.inventory_cost_layers where id=p_layer_id for update;
  if not found then raise exception 'COST_LAYER_NOT_FOUND'; end if;
  update public.inventory_cost_layers set unit_cost=p_unit_cost,cost_status='confirmed' where id=p_layer_id;
  update public.inventory_cost_events set total_cost=v_layer.original_quantity*p_unit_cost, metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('manualCostEdit',jsonb_build_object('unitCost',p_unit_cost,'reason',nullif(btrim(coalesce(p_reason,'')),''),'editedAt',now())) where id=v_layer.source_event_id;
  update public.inventory_cost_allocations set unit_cost=p_unit_cost where source_layer_id=p_layer_id;
  update public.inventory_cost_events outbound set total_cost=totals.total_cost from (select allocation.outbound_event_id,sum(allocation.quantity*allocation.unit_cost)::integer total_cost from public.inventory_cost_allocations allocation group by allocation.outbound_event_id having count(*) filter(where allocation.unit_cost is null)=0) totals where outbound.id=totals.outbound_event_id and exists(select 1 from public.inventory_cost_allocations allocation where allocation.outbound_event_id=outbound.id and allocation.source_layer_id=p_layer_id);
end $$;
revoke all on function public.update_inventory_cost_layer_unit_cost(uuid,integer,text) from public,anon;
grant execute on function public.update_inventory_cost_layer_unit_cost(uuid,integer,text) to authenticated;
