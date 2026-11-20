-- Resolve pending layers and their allocations atomically while preserving the source guard.
create or replace function public.save_and_resolve_missing_inventory_cost(
  p_item_id bigint, p_item_name text, p_basis_type text, p_segments jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare l record; a record; v_cost integer; v_allocations jsonb;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if jsonb_typeof(p_segments)<>'array' or jsonb_array_length(p_segments)=0 then raise exception 'INVALID_COST'; end if;
  v_cost:=(p_segments->(jsonb_array_length(p_segments)-1)->>'unit_cost')::integer;
  if v_cost is null or v_cost<0 then raise exception 'INVALID_COST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_item_name),0));
  perform public.save_settlement_item_cost_segments(p_item_id,p_item_name,p_basis_type,p_segments);
  for l in select layer.* from public.inventory_cost_layers layer join public.inventory_cost_events e on e.id=layer.source_event_id
    where layer.item_name=btrim(p_item_name) and layer.cost_status='pending'
      and ((p_basis_type='historical' and e.event_at<'2026-07-22 00:00:00+09') or (p_basis_type='opening_20260722' and e.event_at>='2026-07-22 00:00:00+09'))
    order by layer.id for update of layer
  loop
    if exists(select 1 from public.inventory_cost_layers child where child.source_layer_id=l.id) then raise exception '연결된 후속 원가가 있어 직접 확정할 수 없습니다.'; end if;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_allocations from public.inventory_cost_allocations x where x.source_layer_id=l.id;
    delete from public.inventory_cost_allocations where source_layer_id=l.id;
    update public.inventory_cost_layers set remaining_quantity=original_quantity where id=l.id;
    update public.inventory_cost_layers set unit_cost=v_cost,cost_status='confirmed' where id=l.id;
    update public.inventory_cost_layers set remaining_quantity=l.remaining_quantity where id=l.id;
    for a in select * from jsonb_populate_recordset(null::public.inventory_cost_allocations,v_allocations) loop
      insert into public.inventory_cost_allocations(id,outbound_event_id,source_layer_id,quantity,unit_cost,created_at) values(a.id,a.outbound_event_id,a.source_layer_id,a.quantity,v_cost,a.created_at);
    end loop;
    update public.inventory_cost_events set total_cost=l.original_quantity*v_cost where id=l.source_event_id;
  end loop;
  update public.inventory_cost_events e set total_cost=s.total_cost from (
    select outbound_event_id,case when bool_or(unit_cost is null) then null else sum(quantity*unit_cost)::integer end total_cost
    from public.inventory_cost_allocations group by outbound_event_id
  ) s where e.id=s.outbound_event_id and e.item_name=btrim(p_item_name);
end $$;
revoke all on function public.save_and_resolve_missing_inventory_cost(bigint,text,text,jsonb) from public,anon;
grant execute on function public.save_and_resolve_missing_inventory_cost(bigint,text,text,jsonb) to authenticated;

-- Repair only the two verified allocations; abort the entire migration if anything changed.
do $$
declare n text; missing record; free_layer record; outbound record; a record; v_snapshot jsonb;
begin
  lock table public.inventory_balances, public.inventory_cost_events, public.inventory_cost_layers, public.inventory_cost_allocations, public.settlement_item_cost_bases in share row exclusive mode;
  foreach n in array array['노보 테이스티 알로에 30ml','탑 망고 30ml'] loop
    -- This repair applies only where the original missing-cost event exists.
    -- Fresh databases and already-repaired environments have nothing to repair.
    if not exists(select 1 from public.inventory_cost_events where item_name=n and reference_type='cost_missing' and reference_id='15736') then continue; end if;
    select l.*,e.id event_id into strict missing from public.inventory_cost_layers l join public.inventory_cost_events e on e.id=l.source_event_id where l.item_name=n and e.reference_type='cost_missing' and e.reference_id='15736' and l.cost_status='pending' and l.original_quantity=1 and l.remaining_quantity=0;
    select l.*,e.event_at into strict free_layer from public.inventory_cost_layers l join public.inventory_cost_events e on e.id=l.source_event_id where l.item_name=n and e.reference_type='stamp_log' and e.reference_id='16053' and e.metadata->>'adjustmentType'='free_in' and l.unit_cost=0 and l.original_quantity=1 and l.remaining_quantity=1;
    select e.* into strict outbound from public.inventory_cost_events e join public.inventory_cost_allocations x on x.outbound_event_id=e.id where x.source_layer_id=missing.id and e.item_name=n and e.reference_type='stamp_log' and e.reference_id='15736' and e.quantity=1 and x.quantity=1 and x.unit_cost is null;
    if free_layer.event_at>outbound.event_at or (select count(*) from public.inventory_cost_allocations where outbound_event_id=outbound.id)<>1 or exists(select 1 from public.inventory_cost_layers where source_layer_id=missing.id) then raise exception '원가 연결 상태가 변경되었습니다: %',n; end if;
    if (select quantity from public.inventory_balances where item_name=n) is distinct from 0 or (select sum(remaining_quantity) from public.inventory_cost_layers where item_name=n)<>1 then raise exception '재고 상태가 변경되었습니다: %',n; end if;
    select * into strict a from public.inventory_cost_allocations where source_layer_id=missing.id;
    v_snapshot:=jsonb_build_object('missing',to_jsonb(missing),'free_layer',to_jsonb(free_layer),'outbound',to_jsonb(outbound),'allocation',to_jsonb(a),'bases',(select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) from public.settlement_item_cost_bases b where b.item_name=n and b.basis_type='opening_20260722'));
    insert into public.inventory_cost_cleanup_audit(source_event_id,trigger_log_id,reason,snapshot) values(missing.event_id,15736,'무상입고 원가 연결 복구',v_snapshot);
    delete from public.inventory_cost_allocations where id=a.id;
    update public.inventory_cost_layers set remaining_quantity=1 where id=missing.id;
    delete from public.inventory_cost_events where id=missing.event_id;
    update public.inventory_cost_layers set remaining_quantity=0 where id=free_layer.id;
    insert into public.inventory_cost_allocations(outbound_event_id,source_layer_id,quantity,unit_cost) values(outbound.id,free_layer.id,1,0);
    update public.inventory_cost_events set total_cost=0 where id=outbound.id;
    if n='탑 망고 30ml' then
      if (select count(*) from public.settlement_item_cost_bases where item_name=n and basis_type='opening_20260722' and quantity=1 and unit_cost=0)<>2 or (select count(*) from public.settlement_item_cost_bases where item_name=n and basis_type='opening_20260722')<>2 then raise exception '원가 기준이 변경되었습니다'; end if;
      delete from public.settlement_item_cost_bases where item_name=n and basis_type='opening_20260722' and sort_order=1;
    end if;
    if (select sum(remaining_quantity) from public.inventory_cost_layers where item_name=n)<>0 then raise exception '원가 잔량 검증 실패'; end if;
  end loop;
end $$;
