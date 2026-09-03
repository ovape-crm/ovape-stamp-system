-- Expose historical gaps without inventing cost sources or consuming layers a second time.
create or replace function public.get_inventory_cost_integrity_report(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_report jsonb;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
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
    select l.source_layer_id,sum(l.original_quantity) quantity from public.inventory_cost_layers l
    join public.inventory_cost_events e on e.id=l.source_event_id where e.metadata->>'manualZeroCost'='true' group by l.source_layer_id
  ), missing_service as (
    select log.id::text log_id,log.created_at event_at,i.n line_index,i.value->>'itemName' item_name,(i.value->>'quantity')::integer quantity
    from public.logs log cross join lateral jsonb_array_elements(coalesce(log.jsonb->'items','[]')) with ordinality i(value,n)
    where log.category='stamp' and btrim(coalesce(i.value->>'inventoryAction','')) in ('','out')
      and btrim(coalesce(i.value->>'remark','')) ~ '^서비스($|[,\s(])'
      and coalesce(nullif(i.value->>'quantity','')::integer,0)>0 and public.is_inventory_item_tracked(btrim(i.value->>'itemName'))
      and not exists(select 1 from public.inventory_cost_events e where e.reference_type='stamp_log' and e.reference_id=log.id::text and e.reference_line_key=i.n::text)
  )
  select jsonb_build_object(
    'stockMismatchCount',(select count(*) from public.inventory_balances b full join layer_totals l on l.item_name=b.item_name
      where coalesce(b.quantity,0)<>coalesce(l.quantity,0) and public.is_inventory_item_tracked(coalesce(b.item_name,l.item_name))),
    'layerMismatchCount',(select count(*) from public.inventory_cost_layers l left join active_usage a on a.source_layer_id=l.id left join transfers t on t.source_layer_id=l.id
      where l.original_quantity-l.remaining_quantity<>coalesce(a.quantity,0)+coalesce(t.quantity,0)),
    'outboundMismatchCount',(select count(*) from public.inventory_cost_events e left join allocation_totals a on a.outbound_event_id=e.id
      where e.direction='out' and e.metadata->>'restoredAt' is null and (e.quantity<>coalesce(a.quantity,0) or e.total_cost is distinct from a.total_cost)),
    'missingServiceCount',(select count(*) from missing_service),
    'missingServiceLines',coalesce((select jsonb_agg(to_jsonb(m)) from (select * from missing_service order by event_at desc,log_id,line_index limit greatest(1,least(coalesce(p_limit,100),1000))) m),'[]'::jsonb)
  ) into v_report;
  return v_report;
end $$;
revoke all on function public.get_inventory_cost_integrity_report(integer) from public,anon;
grant execute on function public.get_inventory_cost_integrity_report(integer) to authenticated;
