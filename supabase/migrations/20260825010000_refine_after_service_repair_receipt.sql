create or replace function public.process_after_service_repair_receipt(
  p_after_service_id bigint,
  p_arrived_on date,
  p_item_name text,
  p_quantity integer,
  p_match_type text,
  p_memo text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_service public.after_services%rowtype;
  v_supplier_id uuid;
  v_customer_name text;
  v_ordered_on date;
  v_item_note text;
  v_order_id uuid;
  v_order_line_id uuid;
  v_receipt_id uuid;
  v_next_quantity integer;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin', 'master')
  ) then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_arrived_on is null then raise exception 'ARRIVED_ON_REQUIRED'; end if;
  if btrim(coalesce(p_item_name, '')) = '' then raise exception 'ITEM_REQUIRED'; end if;
  if coalesce(p_quantity, 0) <= 0 then raise exception 'QUANTITY_REQUIRED'; end if;
  if p_match_type not in ('match', 'mismatch') then raise exception 'MATCH_TYPE_REQUIRED'; end if;

  select * into v_after_service
  from public.after_services
  where id = p_after_service_id
  for update;

  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_after_service.repair_receipt_id is not null then
    raise exception 'AFTER_SERVICE_RECEIPT_ALREADY_EXISTS';
  end if;
  if nullif(btrim(coalesce(v_after_service.supplier_name, '')), '') is null
    or lower(btrim(v_after_service.supplier_name)) in (
      '나중에 선택', '나중에선택', '나중에 수정', '나중에수정'
    )
  then
    raise exception 'SUPPLIER_REQUIRED';
  end if;

  begin
    v_ordered_on := replace(
      nullif(btrim(coalesce(v_after_service.customer_received_date, '')), ''),
      '/', '-'
    )::date;
  exception when others then
    raise exception 'AFTER_SERVICE_RECEIVED_DATE_REQUIRED';
  end;
  if v_ordered_on is null then
    raise exception 'AFTER_SERVICE_RECEIVED_DATE_REQUIRED';
  end if;

  select supplier.id into v_supplier_id
  from public.inventory_suppliers supplier
  where lower(btrim(supplier.name)) = lower(btrim(v_after_service.supplier_name))
    and supplier.is_use = true
  order by supplier.created_at
  limit 1;
  if v_supplier_id is null then raise exception 'SUPPLIER_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.items item
    where btrim(item.item_name) = btrim(p_item_name) and item.is_use = true
  ) then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  if not public.is_inventory_item_tracked(btrim(p_item_name)) then
    raise exception 'ITEM_NOT_INVENTORY_TRACKED';
  end if;
  if p_match_type = 'match' and (
    btrim(p_item_name) <> btrim(v_after_service.item_name)
    or p_quantity <> v_after_service.quantity
  ) then
    raise exception 'MATCH_SELECTION_INVALID';
  end if;
  if p_match_type = 'mismatch' and (
    btrim(p_item_name) = btrim(v_after_service.item_name)
    and p_quantity = v_after_service.quantity
  ) then
    raise exception 'MISMATCH_SELECTION_INVALID';
  end if;

  select customer.name into v_customer_name
  from public.customers customer
  where customer.id = v_after_service.customer_id;
  if v_customer_name is null then raise exception 'CUSTOMER_REQUIRED'; end if;

  v_item_note := 'A/S 교환입고' ||
    case when nullif(btrim(coalesce(p_memo, '')), '') is not null
      then '·' || btrim(p_memo) else '' end;

  insert into public.inventory_purchase_orders(
    supplier_id, ordered_on, status, note, created_by
  ) values (
    v_supplier_id, v_ordered_on, 'completed', null, auth.uid()
  ) returning id into v_order_id;

  insert into public.inventory_purchase_order_lines(
    order_id, item_name, ordered_quantity, received_quantity, pending_quantity,
    unit_price, note, quantity_checked_by, quantity_checked_at,
    handling_type, handling_note, customer_id, after_service_id, inbound_type
  ) values (
    v_order_id, btrim(p_item_name), p_quantity, p_quantity, 0,
    0, v_item_note, auth.uid(), now(),
    'as_exchange_in', v_item_note, v_after_service.customer_id,
    v_after_service.id, 'as_exchange_in'
  ) returning id into v_order_line_id;

  insert into public.inventory_purchase_receipts(
    order_id, arrived_on, note, created_by, after_service_id
  ) values (
    v_order_id, p_arrived_on, null, auth.uid(), v_after_service.id
  ) returning id into v_receipt_id;

  insert into public.inventory_purchase_receipt_lines(
    receipt_id, order_line_id, item_name, quantity, unit_price,
    quantity_checked_by, quantity_checked_at, note
  ) values (
    v_receipt_id, v_order_line_id, btrim(p_item_name), p_quantity, 0,
    auth.uid(), now(), v_item_note
  );

  insert into public.inventory_balances(item_name, quantity, updated_at)
  values (btrim(p_item_name), p_quantity, now())
  on conflict(item_name) do update
    set quantity = public.inventory_balances.quantity + excluded.quantity,
        updated_at = now()
  returning quantity into v_next_quantity;

  insert into public.inventory_movements(
    item_name, movement_type, quantity_delta, quantity_after, unit_price,
    reference_type, reference_id, note, created_by,
    counterparty_name, counterparty_id, inventory_action, item_remark
  ) values (
    btrim(p_item_name), 'purchase_in', p_quantity, v_next_quantity, 0,
    'purchase_receipt', v_receipt_id::text, v_item_note, auth.uid(),
    v_customer_name, v_after_service.customer_id::text,
    'as_exchange_in', 'A/S 교환입고'
  );

  update public.after_services
  set status = 'repair_returned_completed',
      repair_receipt_order_id = v_order_id,
      repair_receipt_id = v_receipt_id,
      repair_receipt_item_name = btrim(p_item_name),
      repair_receipt_quantity = p_quantity,
      repair_receipt_match_type = p_match_type,
      repair_receipt_note = nullif(btrim(coalesce(p_memo, '')), ''),
      repair_receipt_arrived_on = p_arrived_on
  where id = v_after_service.id;

  insert into public.logs(
    admin_id, customer_id, action, note, jsonb, category, after_service_id
  ) values (
    auth.uid(), v_after_service.customer_id,
    'after-service-repair_returned_completed',
    '입고일 : ' || to_char(p_arrived_on, 'YYYY/MM/DD') ||
      case when nullif(btrim(coalesce(p_memo, '')), '') is not null
        then E'\n' || btrim(p_memo) else '' end,
    jsonb_build_object(
      'inventoryReceiptId', v_receipt_id,
      'inventoryOrderId', v_order_id,
      'itemName', btrim(p_item_name),
      'quantity', p_quantity,
      'matchType', p_match_type,
      'historyNote', v_item_note
    ),
    'after_service', v_after_service.id
  );

  return v_receipt_id;
end;
$$;

revoke all on function public.process_after_service_repair_receipt(
  bigint, date, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.process_after_service_repair_receipt(
  bigint, date, text, integer, text, text
) to authenticated;
