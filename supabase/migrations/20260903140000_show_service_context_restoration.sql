-- Show restored historical consumptions as restored, never as active costs.
create or replace function public.get_service_cost_link_context(p_log_id bigint,p_line_index integer)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_log public.logs%rowtype; v_item jsonb; v_name text; v_result jsonb; v_snapshot jsonb;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  select * into v_log from public.logs where id=p_log_id;
  v_item:=v_log.jsonb->'items'->(p_line_index-1); v_name:=btrim(v_item->>'itemName');
  if p_line_index is null or p_line_index<1 or v_item is null or v_log.category<>'stamp'
    or btrim(coalesce(v_item->>'remark','')) !~ '^서비스($|[,\s(])'
    or btrim(coalesce(v_item->>'inventoryAction','')) not in ('','out')
    or coalesce((v_item->>'quantity')::integer,0)<=0 or not public.is_inventory_item_tracked(v_name)
    then raise exception '서비스 출고 원본을 확인할 수 없습니다.'; end if;
  if exists(select 1 from public.inventory_cost_events where reference_type='stamp_log' and reference_id=p_log_id::text and reference_line_key=p_line_index::text)
    then raise exception '이미 원가가 배정된 출고입니다.'; end if;
  select jsonb_build_object('item',v_item,'at',v_log.created_at,
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.inventory_cost_events e where e.item_name=v_name),'[]'::jsonb),
    'layers',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.inventory_cost_layers l where l.item_name=v_name),'[]'::jsonb),
    'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.inventory_cost_allocations a join public.inventory_cost_events e on e.id=a.outbound_event_id where e.item_name=v_name),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(to_jsonb(s) order by s.log_id,s.line_index,s.allocation_id) from public.inventory_service_cost_links s join public.inventory_cost_allocations a on a.id=s.allocation_id join public.inventory_cost_events e on e.id=a.outbound_event_id where e.item_name=v_name),'[]'::jsonb)
  ) into v_snapshot;
  with nearby as (
    (select e.*,'before'::text position from public.inventory_cost_events e where e.item_name=v_name and e.event_at<=v_log.created_at order by e.event_at desc,e.id desc limit 5)
    union all
    (select e.*,'after'::text position from public.inventory_cost_events e where e.item_name=v_name and e.event_at>v_log.created_at order by e.event_at,e.id limit 5)
  ), candidates as (
    select a.id allocation_id,a.source_layer_id,a.unit_cost,a.quantity consumed_quantity,
      a.quantity-coalesce((select sum(s.quantity) from public.inventory_service_cost_links s where s.allocation_id=a.id and (s.log_id,s.line_index)<>(p_log_id,p_line_index)),0) available_quantity,
      coalesce((select s.quantity from public.inventory_service_cost_links s where s.allocation_id=a.id and s.log_id=p_log_id and s.line_index=p_line_index),0) linked_quantity,
      e.event_at consumed_at,e.metadata->>'note' note,src.event_at received_at,src.event_type source_type,src.reference_id source_reference,
      src.event_at<=v_log.created_at eligible
    from public.inventory_cost_allocations a join public.inventory_cost_events e on e.id=a.outbound_event_id
    join public.inventory_cost_layers l on l.id=a.source_layer_id join public.inventory_cost_events src on src.id=l.source_event_id
    where e.item_name=v_name and l.item_name=v_name and e.event_type='reconciliation_out' and e.reference_type='cost_reconciliation'
      and e.direction='out' and e.settlement_effect='none' and e.metadata->>'restoredAt' is null
  )
  select jsonb_build_object('log_id',p_log_id::text,'line_index',p_line_index,'item_name',v_name,'event_at',v_log.created_at,'quantity',(v_item->>'quantity')::integer,
    'snapshot',md5(v_snapshot::text),
    'nearby',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'position',e.position,'event_at',e.event_at,'event_type',e.event_type,'quantity',e.quantity,'total_cost',e.total_cost,'reference',e.reference_id,'restored',(e.metadata->>'restoredAt' is not null),
      'allocations',coalesce((select jsonb_agg(jsonb_build_object('quantity',a.quantity,'unit_cost',a.unit_cost,'received_at',src.event_at,'source_layer_id',l.id) order by l.queue_sequence,l.id) from public.inventory_cost_allocations a join public.inventory_cost_layers l on l.id=a.source_layer_id join public.inventory_cost_events src on src.id=l.source_event_id where a.outbound_event_id=e.id),'[]'::jsonb)) order by e.event_at,e.id) from nearby e),'[]'::jsonb),
    'candidates',coalesce((select jsonb_agg(to_jsonb(c) order by c.received_at,c.allocation_id) from candidates c),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id) from public.inventory_service_cost_link_audit h where h.log_id=p_log_id and h.line_index=p_line_index),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
