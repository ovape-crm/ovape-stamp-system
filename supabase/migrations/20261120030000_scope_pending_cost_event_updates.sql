create or replace function public.save_and_resolve_missing_inventory_cost(
  p_item_id bigint, p_item_name text, p_basis_type text, p_segments jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare l record; a record; v_cost integer; v_allocations jsonb; v_pending boolean; v_outbound_ids uuid[] := '{}';
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if coalesce(jsonb_typeof(p_segments),'null')<>'array' or jsonb_array_length(p_segments)=0 then raise exception 'INVALID_COST'; end if;
  v_cost:=(p_segments->(jsonb_array_length(p_segments)-1)->>'unit_cost')::integer;
  if v_cost is null or v_cost<0 then raise exception 'INVALID_COST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_item_name),0));
  select exists(select 1 from public.inventory_cost_layers pending_layer join public.inventory_cost_events e on e.id=pending_layer.source_event_id
    where pending_layer.item_name=btrim(p_item_name) and pending_layer.cost_status='pending'
      and ((p_basis_type='historical' and e.event_at<'2026-07-22 00:00:00+09') or (p_basis_type='opening_20260722' and e.event_at>='2026-07-22 00:00:00+09'))) into v_pending;
  if v_pending and (select count(distinct (value->>'unit_cost')::integer) from jsonb_array_elements(p_segments))>1 then
    raise exception '단가가 다른 구간은 원가 출처를 확인해야 합니다. 누락 원가를 자동 확정할 수 없습니다.';
  end if;
  perform public.save_settlement_item_cost_segments(p_item_id,p_item_name,p_basis_type,p_segments);
  for l in select layer.* from public.inventory_cost_layers layer join public.inventory_cost_events e on e.id=layer.source_event_id
    where layer.item_name=btrim(p_item_name) and layer.cost_status='pending'
      and ((p_basis_type='historical' and e.event_at<'2026-07-22 00:00:00+09') or (p_basis_type='opening_20260722' and e.event_at>='2026-07-22 00:00:00+09'))
    order by layer.id for update of layer
  loop
    if exists(select 1 from public.inventory_cost_layers child where child.source_layer_id=l.id) then raise exception '연결된 후속 원가가 있어 직접 확정할 수 없습니다.'; end if;
    if exists(select 1 from public.inventory_cost_allocations x join public.inventory_service_cost_links s on s.allocation_id=x.id where x.source_layer_id=l.id)
      or exists(select 1 from public.inventory_cost_allocations x join public.after_service_outbound_cost_allocations s on s.cost_allocation_id=x.id where x.source_layer_id=l.id) then
      raise exception '서비스 또는 A/S에 연결된 누락 원가입니다. 원가 연결을 확인한 후 처리해 주세요.';
    end if;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_allocations from public.inventory_cost_allocations x where x.source_layer_id=l.id;
    delete from public.inventory_cost_allocations where source_layer_id=l.id;
    update public.inventory_cost_layers set remaining_quantity=original_quantity where id=l.id;
    update public.inventory_cost_layers set unit_cost=v_cost,cost_status='confirmed' where id=l.id;
    update public.inventory_cost_layers set remaining_quantity=l.remaining_quantity where id=l.id;
    for a in select * from jsonb_populate_recordset(null::public.inventory_cost_allocations,v_allocations) loop
      insert into public.inventory_cost_allocations(id,outbound_event_id,source_layer_id,quantity,unit_cost,created_at) values(a.id,a.outbound_event_id,a.source_layer_id,a.quantity,v_cost,a.created_at);
      v_outbound_ids := array_append(v_outbound_ids, a.outbound_event_id);
    end loop;
    update public.inventory_cost_events set total_cost=l.original_quantity*v_cost where id=l.source_event_id;
  end loop;
  update public.inventory_cost_events e set total_cost=s.total_cost from (
    select outbound_event_id,case when bool_or(unit_cost is null) then null else sum(quantity*unit_cost)::integer end total_cost
    from public.inventory_cost_allocations where outbound_event_id=any(v_outbound_ids) group by outbound_event_id
  ) s where e.id=s.outbound_event_id and e.total_cost is distinct from s.total_cost;
end $$;
