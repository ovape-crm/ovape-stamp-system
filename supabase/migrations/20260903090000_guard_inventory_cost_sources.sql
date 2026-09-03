-- Protect the source table itself, not just one UI RPC. Never rewrite past allocations
-- as a side effect of editing a receipt or an unused layer.
create or replace function public.guard_inventory_cost_layer_source()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_used integer; v_linked boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(btrim(old.item_name),0));
  v_used:=old.original_quantity-old.remaining_quantity;
  v_linked:=exists(select 1 from public.inventory_cost_allocations where source_layer_id=old.id)
    or exists(select 1 from public.inventory_cost_layers where source_layer_id=old.id);
  if tg_op='DELETE' then
    if v_used>0 or v_linked then raise exception '이미 출고·반품에 연결된 원가층은 삭제할 수 없습니다.'; end if;
    return old;
  end if;
  if (new.unit_cost is distinct from old.unit_cost or new.cost_status is distinct from old.cost_status
      or new.item_name is distinct from old.item_name or new.source_event_id is distinct from old.source_event_id)
    and (v_used>0 or v_linked) then
    raise exception '이미 출고·반품에 연결된 원가층입니다. 단가나 원가 출처를 직접 변경할 수 없습니다.';
  end if;
  if new.original_quantity<v_used then raise exception '이미 사용한 수량보다 입고 수량을 줄일 수 없습니다.'; end if;
  if new.original_quantity<old.original_quantity and exists(select 1 from public.inventory_cost_layers where source_layer_id=old.id) then
    raise exception '분리·반품 원가층의 원본 수량은 직접 줄일 수 없습니다.';
  end if;
  return new;
end $$;
create trigger guard_inventory_cost_layer_source_trigger
before update of unit_cost,cost_status,item_name,source_event_id,original_quantity or delete on public.inventory_cost_layers
for each row execute function public.guard_inventory_cost_layer_source();

create or replace function public.guard_inventory_cost_source_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.direction='in' and (new.event_at is distinct from old.event_at or new.item_name is distinct from old.item_name) then
    perform pg_advisory_xact_lock(hashtextextended(btrim(old.item_name),0));
    if exists(select 1 from public.inventory_cost_layers l where l.source_event_id=old.id and (
      l.remaining_quantity<>l.original_quantity or exists(select 1 from public.inventory_cost_allocations a where a.source_layer_id=l.id)
      or exists(select 1 from public.inventory_cost_layers child where child.source_layer_id=l.id))) then
      raise exception '출고에 연결된 입고일·품목은 직접 변경할 수 없습니다.';
    end if;
  end if;
  return new;
end $$;
create trigger guard_inventory_cost_source_event_trigger before update of event_at,item_name on public.inventory_cost_events
for each row execute function public.guard_inventory_cost_source_event();

create or replace function public.sync_purchase_receipt_cost_edit()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.unit_price is not distinct from old.unit_price then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(old.item_name),0));
  if coalesce(old.demo_quantity,0)>0 or exists(select 1 from public.after_service_outbound_cost_allocations where source_receipt_line_id=old.id)
    or exists(select 1 from public.inventory_cost_events where reference_type='purchase_receipt' and reference_line_key like old.id::text||':%') then
    raise exception '시연·A/S·교환에 연결된 전표 단가는 직접 변경할 수 없습니다.';
  end if;
  -- The table guard rejects used layers; the entire receipt update rolls back on error.
  update public.inventory_cost_layers l set unit_cost=new.unit_price,
    cost_status=case when new.unit_price is null then 'pending' else 'confirmed' end
  from public.inventory_cost_events e where l.source_event_id=e.id
    and e.reference_type='purchase_receipt' and e.reference_line_key=new.id::text;
  update public.inventory_cost_events e set total_cost=e.quantity*new.unit_price
  where e.reference_type='purchase_receipt' and e.reference_line_key=new.id::text;
  if exists(select 1 from public.inventory_purchase_receipt_lines x where x.receipt_id=new.receipt_id and x.item_name=new.item_name and x.id<>new.id) then
    raise exception '같은 품목의 입고 행이 여러 개라 단가 변동을 정확히 연결할 수 없습니다.';
  end if;
  update public.inventory_movements set unit_price=new.unit_price
    where reference_type='purchase_receipt' and reference_id=new.receipt_id::text and item_name=new.item_name and movement_type='purchase_in';
  return new;
end $$;

create or replace function public.sync_purchase_receipt_quantity_edit()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_delta integer; v_layer public.inventory_cost_layers%rowtype;
begin
  if new.quantity=old.quantity then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(old.item_name),0));
  if coalesce(old.demo_quantity,0)>0 or coalesce(new.demo_quantity,0)>0
    or exists(select 1 from public.after_service_outbound_cost_allocations where source_receipt_line_id=old.id)
    or exists(select 1 from public.inventory_cost_events where reference_type='purchase_receipt' and reference_line_key like old.id::text||':%') then
    raise exception '분할·시연·A/S 입고는 수량을 직접 변경할 수 없습니다. 연결 내역을 먼저 확인하세요.';
  end if;
  select l.* into v_layer from public.inventory_cost_layers l join public.inventory_cost_events e on e.id=l.source_event_id
    where e.reference_type='purchase_receipt' and e.reference_line_key=old.id::text for update of l;
  if not found and public.is_inventory_item_tracked(old.item_name) then raise exception '입고 원가층이 누락됐습니다. 수량 변경 전에 연결을 확인하세요.'; end if;
  if v_layer.id is not null and (v_layer.original_quantity<>old.quantity or new.quantity<v_layer.original_quantity-v_layer.remaining_quantity) then
    raise exception '입고 원가층 수량이 다르거나 이미 사용한 수량보다 적게 줄일 수 없습니다.';
  end if;
  if exists(select 1 from public.inventory_purchase_receipt_lines x where x.receipt_id=new.receipt_id and x.item_name=new.item_name and x.id<>new.id)
    or (select count(*) from public.inventory_movements where reference_type='purchase_receipt' and reference_id=new.receipt_id::text and item_name=new.item_name and movement_type='purchase_in')<>1 then
    raise exception '입고 변동 행을 정확히 연결할 수 없습니다. 수량 변경을 중단했습니다.';
  end if;
  v_delta:=new.quantity-old.quantity;
  update public.inventory_purchase_order_lines set received_quantity=received_quantity+v_delta,
    pending_quantity=greatest(ordered_quantity-(received_quantity+v_delta),0) where id=new.order_line_id;
  update public.inventory_balances set quantity=quantity+v_delta,updated_at=now() where item_name=new.item_name;
  if not found then raise exception '재고 기록이 없어 수량 변경을 중단했습니다.'; end if;
  if exists(select 1 from public.inventory_balances where item_name=new.item_name and quantity<0) then raise exception '입고 정정 후 재고가 음수가 됩니다.'; end if;
  update public.inventory_movements set quantity_delta=quantity_delta+v_delta
    where reference_type='purchase_receipt' and reference_id=new.receipt_id::text and item_name=new.item_name and movement_type='purchase_in';
  update public.inventory_cost_layers set original_quantity=original_quantity+v_delta,remaining_quantity=remaining_quantity+v_delta where id=v_layer.id;
  update public.inventory_cost_events set quantity=quantity+v_delta,total_cost=(quantity+v_delta)*v_layer.unit_cost where id=v_layer.source_event_id;
  return new;
end $$;

create or replace function public.sync_purchase_receipt_cost_date()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.arrived_on is not distinct from old.arrived_on then return new; end if;
  update public.inventory_cost_events set event_at=new.arrived_on::timestamp at time zone 'Asia/Seoul'
    where reference_type='purchase_receipt' and reference_id=new.id::text;
  return new;
end $$;
create trigger sync_purchase_receipt_cost_date_trigger after update of arrived_on on public.inventory_purchase_receipts
for each row execute function public.sync_purchase_receipt_cost_date();

-- One FIFO allocator for ordinary, free-service, adjustment and A/S stock outflows.
-- Idempotent calls must have the same quantity/item/date; partial old allocations fail closed.
create or replace function public.allocate_inventory_cost_fifo(
  p_event_type text,p_event_at timestamptz,p_item_id bigint,p_item_name text,p_quantity integer,
  p_reference_type text,p_reference_id text,p_reference_line_key text default '',p_settlement_effect text default 'none',p_metadata jsonb default '{}'
) returns uuid language plpgsql security definer set search_path=public as $$
declare e public.inventory_cost_events%rowtype; l public.inventory_cost_layers%rowtype;
  v_left integer:=p_quantity; v_take integer; v_total bigint:=0; v_pending boolean:=false; v_allocated integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_quantity is null or p_quantity<=0 or p_event_at is null or coalesce(btrim(p_item_name),'')='' then raise exception 'INVALID_COST_EVENT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_item_name),0));
  select * into e from public.inventory_cost_events where reference_type=p_reference_type and reference_id=p_reference_id
    and reference_line_key=coalesce(p_reference_line_key,'') and event_type=p_event_type for update;
  if found then
    if e.quantity<>p_quantity or e.item_name<>btrim(p_item_name) or e.event_at<>p_event_at then raise exception '기존 출고와 원가 배정 요청이 다릅니다.'; end if;
    select coalesce(sum(quantity),0) into v_allocated from public.inventory_cost_allocations where outbound_event_id=e.id;
    if v_allocated<>p_quantity then raise exception '기존 출고 원가 연결이 불완전합니다.'; end if;
    return e.id;
  end if;
  insert into public.inventory_cost_events(event_type,event_at,item_id,item_name,direction,quantity,reference_type,reference_id,reference_line_key,settlement_effect,metadata,created_by)
  values(p_event_type,p_event_at,p_item_id,btrim(p_item_name),'out',p_quantity,p_reference_type,p_reference_id,coalesce(p_reference_line_key,''),p_settlement_effect,coalesce(p_metadata,'{}'),auth.uid()) returning * into e;
  for l in select layer.* from public.inventory_cost_layers layer join public.inventory_cost_events source on source.id=layer.source_event_id
    where layer.item_name=btrim(p_item_name) and layer.remaining_quantity>0 and source.event_at<=p_event_at
    order by layer.queue_sequence,source.event_at,layer.created_at,layer.id for update of layer
  loop
    exit when v_left=0; v_take:=least(v_left,l.remaining_quantity);
    insert into public.inventory_cost_allocations(outbound_event_id,source_layer_id,quantity,unit_cost) values(e.id,l.id,v_take,l.unit_cost);
    update public.inventory_cost_layers set remaining_quantity=remaining_quantity-v_take where id=l.id;
    if l.unit_cost is null then v_pending:=true; else v_total:=v_total+v_take::bigint*l.unit_cost; end if;
    v_left:=v_left-v_take;
  end loop;
  if v_left>0 then raise exception 'COST_LAYER_QUANTITY_MISSING:%',v_left; end if;
  update public.inventory_cost_events set total_cost=case when v_pending then null else v_total::integer end where id=e.id;
  return e.id;
end $$;

revoke all on function public.guard_inventory_cost_layer_source(),public.guard_inventory_cost_source_event(),
  public.sync_purchase_receipt_cost_edit(),public.sync_purchase_receipt_quantity_edit(),public.sync_purchase_receipt_cost_date()
  from public,anon,authenticated;
