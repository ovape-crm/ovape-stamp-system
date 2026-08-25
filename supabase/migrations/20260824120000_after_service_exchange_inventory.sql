alter table public.after_services
  add column if not exists repair_receipt_order_id uuid references public.inventory_purchase_orders(id) on delete set null,
  add column if not exists repair_receipt_id uuid references public.inventory_purchase_receipts(id) on delete set null,
  add column if not exists repair_receipt_item_name text,
  add column if not exists repair_receipt_quantity integer,
  add column if not exists repair_receipt_match_type text,
  add column if not exists repair_receipt_note text,
  add column if not exists repair_receipt_arrived_on date;

alter table public.after_services
  drop constraint if exists after_services_repair_receipt_quantity_check;
alter table public.after_services
  add constraint after_services_repair_receipt_quantity_check
  check (repair_receipt_quantity is null or repair_receipt_quantity > 0);

alter table public.after_services
  drop constraint if exists after_services_repair_receipt_match_type_check;
alter table public.after_services
  add constraint after_services_repair_receipt_match_type_check
  check (repair_receipt_match_type is null or repair_receipt_match_type in ('match', 'mismatch'));

alter table public.inventory_purchase_order_lines
  add column if not exists after_service_id bigint references public.after_services(id) on delete set null,
  add column if not exists inbound_type text not null default 'purchase';

alter table public.inventory_purchase_order_lines
  drop constraint if exists inventory_purchase_order_lines_handling_type_check;
alter table public.inventory_purchase_order_lines
  add constraint inventory_purchase_order_lines_handling_type_check
  check (handling_type in ('none', 'demo', 'reservation', 'customer', 'memo', 'as_exchange_in'));

alter table public.inventory_purchase_order_lines
  drop constraint if exists inventory_purchase_order_lines_inbound_type_check;
alter table public.inventory_purchase_order_lines
  add constraint inventory_purchase_order_lines_inbound_type_check
  check (inbound_type in ('purchase', 'as_exchange_in'));

alter table public.inventory_purchase_receipts
  add column if not exists after_service_id bigint references public.after_services(id) on delete set null;

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
  v_supplier_name text;
  v_customer_name text;
  v_customer_phone text;
  v_history_note text;
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
    ) then
    raise exception 'SUPPLIER_REQUIRED';
  end if;

  select id, name into v_supplier_id, v_supplier_name
  from public.inventory_suppliers
  where lower(btrim(name)) = lower(btrim(v_after_service.supplier_name))
    and is_use = true
  order by created_at
  limit 1;
  if v_supplier_id is null then raise exception 'SUPPLIER_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.items
    where btrim(item_name) = btrim(p_item_name) and is_use = true
  ) then
    raise exception 'ITEM_NOT_FOUND';
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

  select name, phone into v_customer_name, v_customer_phone
  from public.customers
  where id = v_after_service.customer_id;
  if v_customer_name is null then raise exception 'CUSTOMER_REQUIRED'; end if;

  v_history_note := concat_ws(
    '·',
    btrim(v_customer_name),
    btrim(coalesce(v_customer_phone, '')),
    'A/S 교환입고',
    nullif(btrim(coalesce(p_memo, '')), '')
  );

  insert into public.inventory_purchase_orders(
    supplier_id, ordered_on, status, note, created_by
  ) values (
    v_supplier_id, p_arrived_on, 'completed', v_history_note, auth.uid()
  ) returning id into v_order_id;

  insert into public.inventory_purchase_order_lines(
    order_id, item_name, ordered_quantity, received_quantity, pending_quantity,
    unit_price, note, quantity_checked_by, quantity_checked_at,
    handling_type, handling_note, customer_id, after_service_id, inbound_type
  ) values (
    v_order_id, btrim(p_item_name), p_quantity, p_quantity, 0,
    0, v_history_note, auth.uid(), now(),
    'customer', v_history_note, v_after_service.customer_id,
    v_after_service.id, 'as_exchange_in'
  ) returning id into v_order_line_id;

  insert into public.inventory_purchase_receipts(
    order_id, arrived_on, note, created_by, after_service_id
  ) values (
    v_order_id, p_arrived_on, v_history_note, auth.uid(), v_after_service.id
  ) returning id into v_receipt_id;

  insert into public.inventory_purchase_receipt_lines(
    receipt_id, order_line_id, item_name, quantity, unit_price,
    quantity_checked_by, quantity_checked_at, note
  ) values (
    v_receipt_id, v_order_line_id, btrim(p_item_name), p_quantity, 0,
    auth.uid(), now(), v_history_note
  );

  insert into public.inventory_balances(item_name, quantity, updated_at)
  values(btrim(p_item_name), p_quantity, now())
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
    'purchase_receipt', v_receipt_id::text, v_history_note, auth.uid(),
    v_supplier_name, v_supplier_id::text, 'as_exchange_in', 'A/S 교환입고'
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
      'historyNote', v_history_note
    ),
    'after_service', v_after_service.id
  );

  return v_receipt_id;
end;
$$;

revoke all on function public.process_after_service_repair_receipt(bigint, date, text, integer, text, text) from public, anon;
grant execute on function public.process_after_service_repair_receipt(bigint, date, text, integer, text, text) to authenticated;

create or replace function public.mark_manual_after_service_exchange_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_line public.inventory_purchase_order_lines%rowtype;
  v_customer_name text;
  v_customer_phone text;
  v_history_note text;
begin
  select * into v_order_line
  from public.inventory_purchase_order_lines
  where id = new.order_line_id;
  if not found or v_order_line.handling_type <> 'as_exchange_in' then
    return new;
  end if;

  select name, phone into v_customer_name, v_customer_phone
  from public.customers
  where id = v_order_line.customer_id;
  if v_customer_name is null then raise exception 'CUSTOMER_REQUIRED'; end if;

  v_history_note := concat_ws(
    '·',
    btrim(v_customer_name),
    btrim(coalesce(v_customer_phone, '')),
    'A/S 교환입고',
    nullif(btrim(coalesce(v_order_line.handling_note, '')), '')
  );

  update public.inventory_purchase_order_lines
  set inbound_type = 'as_exchange_in', note = v_history_note
  where id = new.order_line_id;

  update public.inventory_purchase_receipt_lines
  set note = v_history_note
  where id = new.id;

  update public.inventory_movements
  set inventory_action = 'as_exchange_in',
      item_remark = 'A/S 교환입고',
      note = v_history_note,
      counterparty_id = v_order_line.customer_id::text
  where reference_type = 'purchase_receipt'
    and reference_id = new.receipt_id::text
    and item_name = new.item_name;

  return new;
end;
$$;

drop trigger if exists mark_manual_after_service_exchange_receipt_trigger
  on public.inventory_purchase_receipt_lines;
create trigger mark_manual_after_service_exchange_receipt_trigger
after insert on public.inventory_purchase_receipt_lines
for each row execute function public.mark_manual_after_service_exchange_receipt();

notify pgrst, 'reload schema';
