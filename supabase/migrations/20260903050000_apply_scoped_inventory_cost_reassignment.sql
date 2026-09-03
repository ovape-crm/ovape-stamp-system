create or replace function public.approve_inventory_cost_reassignment(p_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  update public.inventory_cost_reassignment_runs set status='approved',approved_by=auth.uid()
  where id=p_run_id and status='previewed';
  if not found then raise exception 'COST_REASSIGNMENT_RUN_NOT_PREVIEWED'; end if;
end $$;

create or replace function public.apply_inventory_cost_reassignment(p_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.inventory_cost_reassignment_runs%rowtype; e record; l record; v_remaining integer; v_take integer; v_total integer; v_pending boolean; v_stock integer;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  select * into r from public.inventory_cost_reassignment_runs where id=p_run_id for update;
  if not found or r.status<>'approved' then raise exception 'COST_REASSIGNMENT_NOT_APPROVED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.item_name,0));
  select coalesce(quantity,0) into v_stock from public.inventory_balances where item_name=r.item_name;
  if coalesce(v_stock,0)<>r.inventory_quantity_before then raise exception 'INVENTORY_CHANGED_SINCE_PREVIEW'; end if;
  update public.inventory_cost_layers layer set remaining_quantity=layer.original_quantity-coalesce(used.quantity,0)
  from public.inventory_cost_events source
  left join lateral (select coalesce(sum(a.quantity),0)::integer quantity from public.inventory_cost_allocations a join public.inventory_cost_events outbound on outbound.id=a.outbound_event_id where a.source_layer_id=layer.id and outbound.event_at<r.from_at) used on true
  where layer.source_event_id=source.id and layer.item_name=r.item_name;
  delete from public.inventory_cost_allocations a using public.inventory_cost_events outbound
  where a.outbound_event_id=outbound.id and outbound.item_name=r.item_name and outbound.direction='out' and outbound.event_at>=r.from_at;
  for e in select * from public.inventory_cost_events where item_name=r.item_name and direction='out' and event_at>=r.from_at order by event_at,created_at,id loop
    v_remaining:=e.quantity; v_total:=0; v_pending:=false;
    for l in select layer.* from public.inventory_cost_layers layer join public.inventory_cost_events source on source.id=layer.source_event_id where layer.item_name=r.item_name and layer.remaining_quantity>0 and source.event_at<=e.event_at order by layer.queue_sequence,source.event_at,layer.created_at,layer.id for update loop
      exit when v_remaining=0; v_take:=least(v_remaining,l.remaining_quantity);
      insert into public.inventory_cost_allocations(outbound_event_id,source_layer_id,quantity,unit_cost) values(e.id,l.id,v_take,l.unit_cost);
      update public.inventory_cost_layers set remaining_quantity=remaining_quantity-v_take where id=l.id;
      if l.unit_cost is null then v_pending:=true; else v_total:=v_total+v_take*l.unit_cost; end if;
      v_remaining:=v_remaining-v_take;
    end loop;
    if v_remaining>0 then raise exception 'COST_LAYER_QUANTITY_MISSING:%',v_remaining; end if;
    update public.inventory_cost_events set total_cost=case when v_pending then null else v_total end where id=e.id;
  end loop;
  select coalesce(quantity,0) into v_stock from public.inventory_balances where item_name=r.item_name;
  if coalesce(v_stock,0)<>r.inventory_quantity_before then raise exception 'INVENTORY_QUANTITY_CHANGED'; end if;
  update public.inventory_cost_reassignment_runs set status='applied',applied_at=now(),inventory_quantity_after=coalesce(v_stock,0),cost_after=(select coalesce(sum(total_cost),0)::integer from public.inventory_cost_events where item_name=r.item_name and direction='out' and event_at>=r.from_at) where id=r.id;
end $$;
revoke all on function public.approve_inventory_cost_reassignment(uuid),public.apply_inventory_cost_reassignment(uuid) from public,anon;
grant execute on function public.approve_inventory_cost_reassignment(uuid),public.apply_inventory_cost_reassignment(uuid) to authenticated;
