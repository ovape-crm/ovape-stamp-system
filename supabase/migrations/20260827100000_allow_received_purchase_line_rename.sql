-- 완료된 입고 품목의 오타 정정 시, 해당 발주 라인에 연결된 재고·원가·입고 변동을 함께 이름 변경한다.
create or replace function public.sync_received_purchase_line_name()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_remaining integer;
begin
  if new.item_name is not distinct from old.item_name
    or old.received_quantity <= 0 then
    return new;
  end if;

  -- 입고 전표 안에 같은 기존 품명이 여러 줄이면 변동 행을 한 줄에 정확히 연결할 수 없다.
  if exists (
    select 1
    from public.inventory_purchase_receipt_lines line
    join public.inventory_purchase_receipt_lines another
      on another.receipt_id = line.receipt_id
     and another.item_name = old.item_name
     and another.id <> line.id
    where line.order_line_id = old.id
  ) then
    raise exception 'RECEIVED_ITEM_RENAME_AMBIGUOUS';
  end if;

  update public.inventory_purchase_receipt_lines
  set item_name = new.item_name
  where order_line_id = old.id;

  update public.inventory_cost_events event
  set item_name = new.item_name
  where event.reference_type = 'purchase_receipt'
    and event.reference_line_key in (
      select id::text
      from public.inventory_purchase_receipt_lines
      where order_line_id = old.id
    );

  update public.inventory_cost_layers layer
  set item_name = new.item_name
  where layer.source_event_id in (
    select id
    from public.inventory_cost_events
    where reference_type = 'purchase_receipt'
      and reference_line_key in (
        select id::text
        from public.inventory_purchase_receipt_lines
        where order_line_id = old.id
      )
  );

  update public.inventory_movements movement
  set item_name = new.item_name
  where movement.reference_type = 'purchase_receipt'
    and movement.reference_id in (
      select receipt_id::text
      from public.inventory_purchase_receipt_lines
      where order_line_id = old.id
    )
    and movement.item_name = old.item_name
    and movement.movement_type = 'purchase_in';

  select coalesce(sum(remaining_quantity), 0)::integer into v_remaining
  from public.inventory_cost_layers layer
  where layer.source_event_id in (
    select id
    from public.inventory_cost_events
    where reference_type = 'purchase_receipt'
      and reference_line_key in (
        select id::text
        from public.inventory_purchase_receipt_lines
        where order_line_id = old.id
      )
  );

  if v_remaining <> 0 then
    update public.inventory_balances
    set quantity = quantity - v_remaining, updated_at = now()
    where item_name = old.item_name;

    insert into public.inventory_balances(item_name, quantity, updated_at)
    values(new.item_name, v_remaining, now())
    on conflict(item_name) do update
      set quantity = inventory_balances.quantity + excluded.quantity,
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists sync_received_purchase_line_name_trigger
  on public.inventory_purchase_order_lines;
create trigger sync_received_purchase_line_name_trigger
after update of item_name on public.inventory_purchase_order_lines
for each row execute function public.sync_received_purchase_line_name();

create or replace function public.update_inventory_purchase_order_details(
  p_order_id uuid, p_supplier_id uuid, p_ordered_on date, p_note text,
  p_lines jsonb, p_receipts jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_line jsonb; v_existing public.inventory_purchase_order_lines%rowtype;
  v_receipt jsonb; v_order_status text;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'admin') then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from public.inventory_suppliers where id = p_supplier_id) then raise exception 'SUPPLIER_NOT_FOUND'; end if;
  select status into v_order_status from public.inventory_purchase_orders where id = p_order_id for update;
  if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;
  update public.inventory_purchase_orders set supplier_id=p_supplier_id, ordered_on=p_ordered_on, note=nullif(btrim(coalesce(p_note,'')),''), updated_at=now() where id=p_order_id;
  if exists (select 1 from public.inventory_purchase_order_lines existing_line where existing_line.order_id=p_order_id and existing_line.received_quantity>0 and not exists (select 1 from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) item where nullif(item->>'id','')::uuid=existing_line.id)) then raise exception 'RECEIVED_PURCHASE_ORDER_LINE_DELETE_FORBIDDEN'; end if;
  delete from public.inventory_purchase_order_lines existing_line where existing_line.order_id=p_order_id and existing_line.received_quantity=0 and not exists (select 1 from public.inventory_purchase_receipt_lines receipt_line where receipt_line.order_line_id=existing_line.id) and not exists (select 1 from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) item where nullif(item->>'id','')::uuid=existing_line.id);
  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    if nullif(v_line->>'id','') is null then
      insert into public.inventory_purchase_order_lines(order_id,item_name,ordered_quantity,pending_quantity,unit_price,note,handling_type,handling_note,customer_id,reservation_log_id)
      values(p_order_id,btrim(v_line->>'item_name'),(v_line->>'ordered_quantity')::integer,(v_line->>'ordered_quantity')::integer,nullif(v_line->>'unit_price','')::integer,nullif(btrim(coalesce(v_line->>'note','')),''),coalesce(nullif(v_line->>'handling_type',''),'none'),nullif(btrim(coalesce(v_line->>'handling_note','')),''),nullif(v_line->>'customer_id','')::bigint,nullif(v_line->>'reservation_log_id',''));
      continue;
    end if;
    select * into v_existing from public.inventory_purchase_order_lines where id=(v_line->>'id')::uuid and order_id=p_order_id for update;
    if not found then raise exception 'PURCHASE_ORDER_LINE_NOT_FOUND'; end if;
    if coalesce((v_line->>'ordered_quantity')::integer,0)<greatest(1,v_existing.received_quantity) then raise exception 'ORDERED_QUANTITY_BELOW_RECEIVED'; end if;
    update public.inventory_purchase_order_lines set item_name=btrim(v_line->>'item_name'), ordered_quantity=(v_line->>'ordered_quantity')::integer, pending_quantity=greatest((v_line->>'ordered_quantity')::integer-received_quantity,0), unit_price=nullif(v_line->>'unit_price','')::integer, note=nullif(btrim(coalesce(v_line->>'note','')),''), handling_type=coalesce(nullif(v_line->>'handling_type',''),v_existing.handling_type,'none'), handling_note=nullif(btrim(coalesce(v_line->>'handling_note','')),''), customer_id=nullif(v_line->>'customer_id','')::bigint, reservation_log_id=nullif(v_line->>'reservation_log_id','') where id=v_existing.id;
  end loop;
  for v_receipt in select value from jsonb_array_elements(coalesce(p_receipts,'[]'::jsonb)) loop
    update public.inventory_purchase_receipts set arrived_on=(v_receipt->>'arrived_on')::date, note=nullif(btrim(coalesce(v_receipt->>'note','')),'') where id=(v_receipt->>'id')::uuid and order_id=p_order_id and reversed_at is null;
  end loop;
  if v_order_status not in ('closed','cancelled') then
    update public.inventory_purchase_orders set status=case when not exists(select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and received_quantity<ordered_quantity) then 'completed' when exists(select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and received_quantity>0) then 'partial' else 'pending' end, updated_at=now() where id=p_order_id;
  end if;
end;
$$;
