-- Repeated callbacks may update metadata, but cannot change a layer's identity or
-- silently reuse an event with a different quantity/date/item.
create or replace function public.create_inventory_cost_layer(
  p_event_type text,p_event_at timestamptz,p_item_id bigint,p_item_name text,p_quantity integer,
  p_unit_cost integer,p_cost_status text,p_queue_position text,p_reference_type text,p_reference_id text,
  p_reference_line_key text default '',p_source_layer_id uuid default null,p_metadata jsonb default '{}'
) returns uuid language plpgsql security definer set search_path=public as $$
declare e public.inventory_cost_events%rowtype; l public.inventory_cost_layers%rowtype; v_sequence numeric(30,6);
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(btrim(p_item_name),'')='' or p_quantity is null or p_quantity<=0 or p_event_at is null then raise exception 'INVALID_COST_EVENT'; end if;
  if p_queue_position not in ('front','back') or p_queue_position is null then raise exception 'INVALID_QUEUE_POSITION'; end if;
  if p_cost_status not in ('pending','confirmed') or p_cost_status is null
    or (p_cost_status='confirmed' and (p_unit_cost is null or p_unit_cost<0))
    or (p_cost_status='pending' and p_unit_cost is not null) then raise exception 'INVALID_UNIT_COST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_item_name),0));
  select * into e from public.inventory_cost_events where reference_type=p_reference_type and reference_id=p_reference_id
    and reference_line_key=coalesce(p_reference_line_key,'') and event_type=p_event_type for update;
  if found then
    select * into l from public.inventory_cost_layers where source_event_id=e.id;
    if l.id is null or e.quantity<>p_quantity or l.original_quantity<>p_quantity
      or e.item_name<>btrim(p_item_name) or e.event_at<>p_event_at
      or l.source_layer_id is distinct from p_source_layer_id then raise exception '기존 입고층과 생성 요청이 다릅니다. 원가 연결을 확인하세요.'; end if;
    -- An explicit later cost confirmation must survive retries of the original callback.
    return e.id;
  end if;
  if p_queue_position='front' then
    select coalesce(min(queue_sequence),0)-1 into v_sequence from public.inventory_cost_layers where item_name=btrim(p_item_name);
  else
    select coalesce(max(queue_sequence),0)+1 into v_sequence from public.inventory_cost_layers where item_name=btrim(p_item_name);
  end if;
  insert into public.inventory_cost_events(event_type,event_at,item_id,item_name,direction,quantity,total_cost,reference_type,reference_id,reference_line_key,settlement_effect,metadata,created_by)
  values(p_event_type,p_event_at,p_item_id,btrim(p_item_name),'in',p_quantity,p_quantity*p_unit_cost,p_reference_type,p_reference_id,
    coalesce(p_reference_line_key,''),'none',coalesce(p_metadata,'{}')||jsonb_build_object('queuePosition',p_queue_position),auth.uid()) returning * into e;
  insert into public.inventory_cost_layers(source_event_id,item_id,item_name,original_quantity,remaining_quantity,unit_cost,queue_sequence,cost_status,source_layer_id)
  values(e.id,p_item_id,btrim(p_item_name),p_quantity,p_quantity,p_unit_cost,v_sequence,p_cost_status,p_source_layer_id);
  return e.id;
end $$;

create or replace function public.update_inventory_cost_layer_unit_cost(p_layer_id uuid,p_unit_cost integer,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare l public.inventory_cost_layers%rowtype; v_item text;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if p_unit_cost is null or p_unit_cost<0 then raise exception 'INVALID_UNIT_COST'; end if;
  select item_name into v_item from public.inventory_cost_layers where id=p_layer_id;
  if not found then raise exception 'COST_LAYER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(v_item),0));
  select * into l from public.inventory_cost_layers where id=p_layer_id for update;
  if not found then raise exception 'COST_LAYER_NOT_FOUND'; end if;
  if l.unit_cost=p_unit_cost and l.cost_status='confirmed' then return; end if;
  -- The shared table trigger protects all allocated/derived layers, including this RPC.
  update public.inventory_cost_layers set unit_cost=p_unit_cost,cost_status='confirmed' where id=p_layer_id;
  update public.inventory_cost_events set total_cost=l.original_quantity*p_unit_cost,
    metadata=metadata||jsonb_build_object('manualCostEdit',jsonb_build_object('unitCost',p_unit_cost,'reason',nullif(btrim(p_reason),''),'editedAt',now(),'editedBy',auth.uid()))
    where id=l.source_event_id;
end $$;

drop trigger if exists a_rollback_stamp_log_cost_ledger_trigger on public.logs;
create trigger a_rollback_stamp_log_cost_ledger_trigger before update of jsonb,category,created_at or delete on public.logs
for each row execute function public.rollback_stamp_log_cost_ledger();
drop trigger if exists z_sync_standard_outbound_cost_ledger_trigger on public.logs;
create trigger z_sync_standard_outbound_cost_ledger_trigger after insert or update of jsonb,category,created_at on public.logs
for each row execute function public.sync_standard_outbound_cost_ledger();
revoke all on function public.create_inventory_cost_layer(text,timestamptz,bigint,text,integer,integer,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.update_inventory_cost_layer_unit_cost(uuid,integer,text) from public,anon;
grant execute on function public.update_inventory_cost_layer_unit_cost(uuid,integer,text) to authenticated;
