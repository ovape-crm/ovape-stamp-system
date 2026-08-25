-- Harden the A/S inventory lifecycle and keep manual historical
-- classifications both auditable and role-restricted.

create or replace function public.is_current_user_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and oss_role = 'master'
  );
$$;

revoke all on function public.is_current_user_master() from public, anon, authenticated;

-- A linked order line is owned by the A/S workflow. An unlinked
-- as_exchange_in line is a manual historical classification and only a
-- master may set or clear it. Once received, the classification is immutable
-- because the previous receipt/movement snapshots cannot be reconstructed.
create or replace function public.guard_after_service_exchange_in_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_is_generic_as boolean := false;
  v_new_is_generic_as boolean := false;
begin
  if tg_op = 'DELETE' then
    if old.after_service_id is not null then
      raise exception 'AFTER_SERVICE_EXCHANGE_IN_LINE_DELETE_FORBIDDEN';
    end if;

    if old.handling_type = 'as_exchange_in'
      or old.inbound_type = 'as_exchange_in'
    then
      if exists (
        select 1
        from public.inventory_purchase_receipt_lines receipt_line
        where receipt_line.order_line_id = old.id
      ) then
        raise exception 'AFTER_SERVICE_EXCHANGE_IN_LINE_DELETE_FORBIDDEN';
      end if;

      if not public.is_current_user_master() then
        raise exception 'MASTER_REQUIRED';
      end if;
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE'
    and old.after_service_id is distinct from new.after_service_id
  then
    raise exception 'AFTER_SERVICE_LINE_LINK_IMMUTABLE';
  end if;

  if tg_op = 'UPDATE'
    and old.handling_type = 'as_exchange_in'
    and new.handling_type is distinct from 'as_exchange_in'
    and exists (
      select 1
      from public.inventory_purchase_receipt_lines receipt_line
      where receipt_line.order_line_id = old.id
    )
  then
    raise exception 'COMPLETED_AS_EXCHANGE_IN_CLASSIFICATION_IMMUTABLE';
  end if;

  if tg_op = 'UPDATE' then
    v_old_is_generic_as :=
      old.after_service_id is null
      and (
        old.handling_type = 'as_exchange_in'
        or old.inbound_type = 'as_exchange_in'
      );
  end if;

  v_new_is_generic_as :=
    new.after_service_id is null
    and new.handling_type = 'as_exchange_in';

  if (
      tg_op = 'INSERT'
      and v_new_is_generic_as
    ) or (
      tg_op = 'UPDATE'
      and v_old_is_generic_as is distinct from v_new_is_generic_as
    )
  then
    if not public.is_current_user_master() then
      raise exception 'MASTER_REQUIRED';
    end if;
  end if;

  if (
      new.after_service_id is not null
      or new.handling_type = 'as_exchange_in'
    )
    and new.customer_id is null
  then
    raise exception 'CUSTOMER_REQUIRED';
  end if;

  if new.after_service_id is not null
    and not exists (
      select 1
      from public.after_services after_service
      where after_service.id = new.after_service_id
        and after_service.customer_id = new.customer_id
    )
  then
    raise exception 'AFTER_SERVICE_CUSTOMER_MISMATCH';
  end if;

  if new.after_service_id is not null
    or new.handling_type = 'as_exchange_in'
  then
    new.handling_type := 'as_exchange_in';
    new.inbound_type := 'as_exchange_in';
  else
    new.inbound_type := 'purchase';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_after_service_exchange_in_line_insert_trigger
  on public.inventory_purchase_order_lines;
create trigger guard_after_service_exchange_in_line_insert_trigger
before insert on public.inventory_purchase_order_lines
for each row execute function public.guard_after_service_exchange_in_line();

drop trigger if exists guard_after_service_exchange_in_line_update_trigger
  on public.inventory_purchase_order_lines;
create trigger guard_after_service_exchange_in_line_update_trigger
before update of handling_type, inbound_type, after_service_id, customer_id
on public.inventory_purchase_order_lines
for each row execute function public.guard_after_service_exchange_in_line();

drop trigger if exists guard_after_service_exchange_in_line_delete_trigger
  on public.inventory_purchase_order_lines;
create trigger guard_after_service_exchange_in_line_delete_trigger
before delete on public.inventory_purchase_order_lines
for each row execute function public.guard_after_service_exchange_in_line();

revoke all on function public.guard_after_service_exchange_in_line()
  from public, anon, authenticated;

-- Synchronize a completed, unlinked purchase line when a master classifies it
-- as a historical A/S exchange receipt.
create or replace function public.sync_historical_after_service_exchange_in_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_name text;
  v_customer_phone text;
  v_history_note text;
begin
  if new.after_service_id is not null
    or new.handling_type <> 'as_exchange_in'
  then
    return new;
  end if;

  if not exists (
    select 1
    from public.inventory_purchase_receipt_lines receipt_line
    where receipt_line.order_line_id = new.id
  ) then
    return new;
  end if;

  select customer.name, customer.phone
  into v_customer_name, v_customer_phone
  from public.customers customer
  where customer.id = new.customer_id;

  if v_customer_name is null then
    raise exception 'CUSTOMER_REQUIRED';
  end if;

  v_history_note := concat_ws(
    '·',
    btrim(v_customer_name),
    btrim(coalesce(v_customer_phone, '')),
    'A/S 교환입고',
    nullif(btrim(coalesce(new.handling_note, '')), '')
  );

  update public.inventory_purchase_order_lines
  set inbound_type = 'as_exchange_in',
      note = v_history_note
  where id = new.id
    and (
      inbound_type <> 'as_exchange_in'
      or note is distinct from v_history_note
    );

  update public.inventory_purchase_receipt_lines receipt_line
  set note = v_history_note
  where receipt_line.order_line_id = new.id
    and receipt_line.note is distinct from v_history_note;

  update public.inventory_movements movement
  set inventory_action = 'as_exchange_in',
      item_remark = 'A/S 교환입고',
      counterparty_name = v_customer_name,
      counterparty_id = new.customer_id::text,
      note = v_history_note
  from public.inventory_purchase_receipt_lines receipt_line
  where receipt_line.order_line_id = new.id
    and movement.reference_type = 'purchase_receipt'
    and movement.reference_id = receipt_line.receipt_id::text
    and movement.item_name = receipt_line.item_name;

  return new;
end;
$$;

drop trigger if exists sync_historical_after_service_exchange_in_line_trigger
  on public.inventory_purchase_order_lines;
create trigger sync_historical_after_service_exchange_in_line_trigger
after update of handling_type, handling_note, customer_id
on public.inventory_purchase_order_lines
for each row
when (new.handling_type = 'as_exchange_in')
execute function public.sync_historical_after_service_exchange_in_line();

revoke all on function public.sync_historical_after_service_exchange_in_line()
  from public, anon, authenticated;

-- Manual future receipts use the receipt-line trigger. Official linked A/S
-- receipts are already fully populated by process_after_service_repair_receipt
-- and must not have their composed note composed a second time.
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

  if not found
    or v_order_line.handling_type <> 'as_exchange_in'
    or v_order_line.after_service_id is not null
  then
    return new;
  end if;

  select customer.name, customer.phone
  into v_customer_name, v_customer_phone
  from public.customers customer
  where customer.id = v_order_line.customer_id;

  if v_customer_name is null then
    raise exception 'CUSTOMER_REQUIRED';
  end if;

  v_history_note := concat_ws(
    '·',
    btrim(v_customer_name),
    btrim(coalesce(v_customer_phone, '')),
    'A/S 교환입고',
    nullif(btrim(coalesce(v_order_line.handling_note, '')), '')
  );

  update public.inventory_purchase_order_lines
  set inbound_type = 'as_exchange_in',
      note = v_history_note
  where id = new.order_line_id;

  update public.inventory_purchase_receipt_lines
  set note = v_history_note
  where id = new.id;

  update public.inventory_movements
  set inventory_action = 'as_exchange_in',
      item_remark = 'A/S 교환입고',
      counterparty_name = v_customer_name,
      counterparty_id = v_order_line.customer_id::text,
      note = v_history_note
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

revoke all on function public.mark_manual_after_service_exchange_receipt()
  from public, anon, authenticated;

-- Replace the official A/S receipt function so its order-line presentation
-- classification agrees with its inbound and movement classifications.
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
    )
  then
    raise exception 'SUPPLIER_REQUIRED';
  end if;

  select supplier.id, supplier.name
  into v_supplier_id, v_supplier_name
  from public.inventory_suppliers supplier
  where lower(btrim(supplier.name)) = lower(btrim(v_after_service.supplier_name))
    and supplier.is_use = true
  order by supplier.created_at
  limit 1;

  if v_supplier_id is null then raise exception 'SUPPLIER_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.items item
    where btrim(item.item_name) = btrim(p_item_name)
      and item.is_use = true
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

  select customer.name, customer.phone
  into v_customer_name, v_customer_phone
  from public.customers customer
  where customer.id = v_after_service.customer_id;

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
    'as_exchange_in', v_history_note, v_after_service.customer_id,
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
      'historyNote', v_history_note
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

-- Repair the presentation classification for official receipts created by the
-- previous function version. The linked-row guard deliberately permits this.
update public.inventory_purchase_order_lines order_line
set handling_type = 'as_exchange_in',
    inbound_type = 'as_exchange_in',
    customer_id = after_service.customer_id
from public.after_services after_service
where order_line.after_service_id = after_service.id
  and (
    order_line.inbound_type is distinct from 'as_exchange_in'
    or order_line.handling_type is distinct from 'as_exchange_in'
    or order_line.customer_id is distinct from after_service.customer_id
  );

-- Generic A/S outbound classification signatures contain only identity and
-- classification fields, so unrelated memo/payment edits remain available to
-- their existing roles.
create or replace function public.as_exchange_out_classification_signature(
  p_jsonb jsonb
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'position', entry.position,
        'itemId', coalesce(entry.item->>'itemId', ''),
        'itemName', btrim(coalesce(entry.item->>'itemName', '')),
        'inventoryAction', 'as_exchange_out'
      )
      order by entry.position
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_jsonb->'items') = 'array' then p_jsonb->'items'
      else '[]'::jsonb
    end
  )
    with ordinality as entry(item, position)
  where entry.item->>'inventoryAction' = 'as_exchange_out';
$$;

revoke all on function public.as_exchange_out_classification_signature(jsonb)
  from public, anon, authenticated;

create or replace function public.is_valid_after_service_exchange_log(
  p_after_service_id bigint,
  p_customer_id bigint,
  p_category text,
  p_jsonb jsonb
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    p_after_service_id is not null
    and p_category = 'stamp'
    and exists (
      select 1
      from public.users app_user
      where app_user.id = auth.uid()
        and app_user.oss_role in ('staff', 'admin', 'master')
    )
    and nullif(btrim(coalesce(p_jsonb->>'afterServiceId', '')), '') ~ '^[0-9]+$'
    and p_jsonb->>'afterServiceId' = p_after_service_id::text
    and p_jsonb->>'afterServiceOperation' = 'exchange'
    and exists (
      select 1
      from public.after_services after_service
      where after_service.id = p_after_service_id
        and after_service.customer_id is not null
        and after_service.customer_id is not distinct from p_customer_id
        and after_service.is_exchange_issued = true
        and (
          select count(*)
          from jsonb_array_elements(
            case
              when jsonb_typeof(p_jsonb->'items') = 'array'
                then p_jsonb->'items'
              else '[]'::jsonb
            end
          ) item
          where item->>'inventoryAction' = 'as_exchange_out'
        ) = 1
        and exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(p_jsonb->'items') = 'array'
                then p_jsonb->'items'
              else '[]'::jsonb
            end
          ) item
          where item->>'inventoryAction' = 'as_exchange_out'
            and btrim(coalesce(item->>'itemName', '')) =
              btrim(coalesce(after_service.exchange_item_name, ''))
            and case
              when coalesce(item->>'quantity', '') ~ '^[0-9]+$'
                then (item->>'quantity')::numeric
              else null
            end = after_service.exchange_quantity
        )
    )
  ), false);
$$;

revoke all on function public.is_valid_after_service_exchange_log(
  bigint, bigint, text, jsonb
) from public, anon, authenticated;

-- Logs created before the dedicated after_service_id write path already carry
-- the official JSON metadata. Backfill only rows that still agree with the
-- active A/S exchange record so later staff edits use the same guarded path.
update public.logs outbound
set after_service_id = after_service.id,
    customer_id = after_service.customer_id
from public.after_services after_service
where outbound.after_service_id is null
  and outbound.category = 'stamp'
  and outbound.jsonb->>'afterServiceId' = after_service.id::text
  and outbound.jsonb->>'afterServiceOperation' = 'exchange'
  and after_service.customer_id is not null
  and after_service.is_exchange_issued = true
  and (
    select count(*)
    from jsonb_array_elements(
      case
        when jsonb_typeof(outbound.jsonb->'items') = 'array'
          then outbound.jsonb->'items'
        else '[]'::jsonb
      end
    ) item
    where item->>'inventoryAction' = 'as_exchange_out'
  ) = 1
  and exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(outbound.jsonb->'items') = 'array'
          then outbound.jsonb->'items'
        else '[]'::jsonb
      end
    ) item
    where item->>'inventoryAction' = 'as_exchange_out'
      and btrim(coalesce(item->>'itemName', '')) =
        btrim(coalesce(after_service.exchange_item_name, ''))
      and case
        when coalesce(item->>'quantity', '') ~ '^[0-9]+$'
          then (item->>'quantity')::numeric
        else null
      end = after_service.exchange_quantity
  );

create or replace function public.guard_generic_after_service_exchange_out()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_signature jsonb := '[]'::jsonb;
  v_new_signature jsonb := '[]'::jsonb;
  v_json_after_service_id bigint;
  v_official_customer_id bigint;
  v_is_official boolean := false;
  v_link_fields_changed boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_old_signature := public.as_exchange_out_classification_signature(old.jsonb);
  end if;

  if tg_op = 'DELETE' then
    -- The UI first clears the A/S flag and then deletes the linked outbound
    -- log. Therefore deletion uses the immutable stored linkage rather than
    -- requiring the current A/S exchange flag to still be true.
    v_is_official := coalesce((
      old.after_service_id is not null
      and old.category = 'stamp'
      and old.jsonb->>'afterServiceId' = old.after_service_id::text
      and old.jsonb->>'afterServiceOperation' = 'exchange'
      and v_old_signature <> '[]'::jsonb
      and exists (
        select 1
        from public.users app_user
        where app_user.id = auth.uid()
          and app_user.oss_role in ('staff', 'admin', 'master')
      )
    ), false);

    if v_old_signature <> '[]'::jsonb
      and not v_is_official
      and not public.is_current_user_master()
    then
      raise exception 'MASTER_REQUIRED';
    end if;
    return old;
  end if;

  -- Recognize official A/S traffic from the actual A/S row, not merely from
  -- caller-controlled JSON. This also follows a legitimate A/S customer edit
  -- without requiring a separate client-side log update.
  if new.category = 'stamp'
    and new.jsonb->>'afterServiceOperation' = 'exchange'
    and nullif(btrim(coalesce(new.jsonb->>'afterServiceId', '')), '') ~ '^[0-9]+$'
  then
    select after_service.id, after_service.customer_id
    into v_json_after_service_id, v_official_customer_id
    from public.after_services after_service
    where after_service.id::text = new.jsonb->>'afterServiceId'
      and after_service.customer_id is not null
      and after_service.is_exchange_issued = true
      and (
        select count(*)
        from jsonb_array_elements(
          case
            when jsonb_typeof(new.jsonb->'items') = 'array'
              then new.jsonb->'items'
            else '[]'::jsonb
          end
        ) item
        where item->>'inventoryAction' = 'as_exchange_out'
      ) = 1
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(new.jsonb->'items') = 'array'
              then new.jsonb->'items'
            else '[]'::jsonb
          end
        ) item
        where item->>'inventoryAction' = 'as_exchange_out'
          and btrim(coalesce(item->>'itemName', '')) =
            btrim(coalesce(after_service.exchange_item_name, ''))
          and case
            when coalesce(item->>'quantity', '') ~ '^[0-9]+$'
              then (item->>'quantity')::numeric
            else null
          end = after_service.exchange_quantity
      )
    limit 1;

    if v_json_after_service_id is not null
      and (
        new.after_service_id is null
        or new.after_service_id = v_json_after_service_id
      )
    then
      new.after_service_id := v_json_after_service_id;
      new.customer_id := v_official_customer_id;
    end if;
  end if;

  v_new_signature := public.as_exchange_out_classification_signature(new.jsonb);
  v_is_official := public.is_valid_after_service_exchange_log(
    new.after_service_id,
    new.customer_id,
    new.category,
    new.jsonb
  );

  if tg_op = 'UPDATE' then
    v_link_fields_changed :=
      old.after_service_id is distinct from new.after_service_id
      or old.customer_id is distinct from new.customer_id
      or old.jsonb->>'afterServiceId'
        is distinct from new.jsonb->>'afterServiceId'
      or old.jsonb->>'afterServiceOperation'
        is distinct from new.jsonb->>'afterServiceOperation'
      or (
        old.category is distinct from new.category
        and not coalesce((
          old.category = 'reservation'
          and new.category = 'stamp'
          and v_old_signature = v_new_signature
        ), false)
      );

    if old.after_service_id is distinct from new.after_service_id
      and (
        v_old_signature <> '[]'::jsonb
        or v_new_signature <> '[]'::jsonb
      )
      and (
        old.after_service_id is not null
        or not v_is_official
      )
      and not public.is_current_user_master()
    then
      raise exception 'MASTER_REQUIRED';
    end if;
  end if;

  if (
      v_old_signature is distinct from v_new_signature
      or (
        v_link_fields_changed
        and (
          v_old_signature <> '[]'::jsonb
          or v_new_signature <> '[]'::jsonb
        )
      )
      or (
        new.after_service_id is not null
        and v_new_signature <> '[]'::jsonb
        and not v_is_official
      )
    )
    and not v_is_official
    and not public.is_current_user_master()
  then
    raise exception 'MASTER_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_generic_after_service_exchange_out_insert_trigger
  on public.logs;
create trigger guard_generic_after_service_exchange_out_insert_trigger
before insert on public.logs
for each row execute function public.guard_generic_after_service_exchange_out();

drop trigger if exists guard_generic_after_service_exchange_out_update_trigger
  on public.logs;
create trigger guard_generic_after_service_exchange_out_update_trigger
before update of jsonb, after_service_id, customer_id, category on public.logs
for each row execute function public.guard_generic_after_service_exchange_out();

drop trigger if exists guard_generic_after_service_exchange_out_delete_trigger
  on public.logs;
create trigger guard_generic_after_service_exchange_out_delete_trigger
before delete on public.logs
for each row execute function public.guard_generic_after_service_exchange_out();

revoke all on function public.guard_generic_after_service_exchange_out()
  from public, anon, authenticated;

-- Keep route snapshots current even when a JSON edit changes only the
-- classification and therefore has a zero inventory quantity delta.
create or replace function public.sync_outbound_log_movement_snapshot(
  p_log_id text,
  p_customer_id bigint,
  p_jsonb jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_name text;
  v_item record;
begin
  select customer.name
  into v_customer_name
  from public.customers customer
  where customer.id = p_customer_id;

  for v_item in
    select distinct on (btrim(entry.item->>'itemName'))
      entry.item
    from jsonb_array_elements(
      case
        when jsonb_typeof(p_jsonb->'items') = 'array' then p_jsonb->'items'
        else '[]'::jsonb
      end
    )
      with ordinality as entry(item, position)
    where nullif(btrim(entry.item->>'itemName'), '') is not null
    order by btrim(entry.item->>'itemName'), entry.position
  loop
    update public.inventory_movements movement
    set inventory_action = nullif(v_item.item->>'inventoryAction', ''),
        item_remark = nullif(v_item.item->>'remark', ''),
        counterparty_name = v_customer_name,
        counterparty_id = p_customer_id::text
    where movement.reference_type = 'outbound_log'
      and movement.reference_id = p_log_id
      and btrim(movement.item_name) = btrim(v_item.item->>'itemName');
  end loop;
end;
$$;

revoke all on function public.sync_outbound_log_movement_snapshot(
  text, bigint, jsonb
) from public, anon, authenticated;

create or replace function public.sync_outbound_log_movement_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category = 'stamp' then
    perform public.sync_outbound_log_movement_snapshot(
      new.id::text,
      new.customer_id,
      new.jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists sync_outbound_log_movement_snapshots_trigger
  on public.logs;
drop trigger if exists sync_outbound_log_movement_snapshots_insert_trigger
  on public.logs;
create trigger sync_outbound_log_movement_snapshots_insert_trigger
after insert on public.logs
for each row execute function public.sync_outbound_log_movement_snapshots();

drop trigger if exists sync_outbound_log_movement_snapshots_update_trigger
  on public.logs;
create trigger sync_outbound_log_movement_snapshots_update_trigger
after update of jsonb, customer_id, category on public.logs
for each row execute function public.sync_outbound_log_movement_snapshots();

revoke all on function public.sync_outbound_log_movement_snapshots()
  from public, anon, authenticated;

do $$
declare
  v_log record;
begin
  for v_log in
    select log.id::text as id, log.customer_id, log.jsonb
    from public.logs log
    where log.category = 'stamp'
      and jsonb_typeof(log.jsonb->'items') = 'array'
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(log.jsonb->'items') = 'array'
              then log.jsonb->'items'
            else '[]'::jsonb
          end
        ) item
        where item->>'inventoryAction' = 'as_exchange_out'
      )
  loop
    perform public.sync_outbound_log_movement_snapshot(
      v_log.id,
      v_log.customer_id,
      v_log.jsonb
    );
  end loop;
end;
$$;

-- Protect both sides of the A/S receipt linkage. Raising from a trigger also
-- rolls back any balance/movement changes made earlier in a generic reverse or
-- delete RPC transaction.
create or replace function public.guard_linked_after_service_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_linked boolean;
  v_is_generic_as boolean;
begin
  v_is_linked :=
    old.after_service_id is not null
    or exists (
      select 1
      from public.after_services after_service
      where after_service.repair_receipt_id = old.id
    );

  v_is_generic_as := exists (
    select 1
    from public.inventory_purchase_receipt_lines receipt_line
    join public.inventory_purchase_order_lines order_line
      on order_line.id = receipt_line.order_line_id
    where receipt_line.receipt_id = old.id
      and order_line.after_service_id is null
      and (
        order_line.handling_type = 'as_exchange_in'
        or order_line.inbound_type = 'as_exchange_in'
      )
  );

  if tg_op = 'DELETE' then
    if v_is_linked then
      raise exception 'AFTER_SERVICE_RECEIPT_DELETE_FORBIDDEN';
    end if;
    if v_is_generic_as and not public.is_current_user_master() then
      raise exception 'MASTER_REQUIRED';
    end if;
    return old;
  end if;

  if v_is_linked and (
    new.reversed_at is distinct from old.reversed_at
    or new.after_service_id is distinct from old.after_service_id
    or new.order_id is distinct from old.order_id
  ) then
    raise exception 'AFTER_SERVICE_RECEIPT_REVERSE_FORBIDDEN';
  end if;

  if new.after_service_id is distinct from old.after_service_id then
    raise exception 'AFTER_SERVICE_RECEIPT_LINK_IMMUTABLE';
  end if;

  if v_is_generic_as
    and new.reversed_at is distinct from old.reversed_at
    and not public.is_current_user_master()
  then
    raise exception 'MASTER_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_linked_after_service_receipt_update_trigger
  on public.inventory_purchase_receipts;
create trigger guard_linked_after_service_receipt_update_trigger
before update of reversed_at, after_service_id, order_id
on public.inventory_purchase_receipts
for each row execute function public.guard_linked_after_service_receipt();

drop trigger if exists guard_linked_after_service_receipt_delete_trigger
  on public.inventory_purchase_receipts;
create trigger guard_linked_after_service_receipt_delete_trigger
before delete on public.inventory_purchase_receipts
for each row execute function public.guard_linked_after_service_receipt();

revoke all on function public.guard_linked_after_service_receipt()
  from public, anon, authenticated;

create or replace function public.guard_linked_after_service_order_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
      select 1
      from public.after_services after_service
      where after_service.repair_receipt_order_id = old.id
    )
    or exists (
      select 1
      from public.inventory_purchase_receipts receipt
      where receipt.order_id = old.id
        and receipt.after_service_id is not null
    )
    or exists (
      select 1
      from public.inventory_purchase_order_lines order_line
      where order_line.order_id = old.id
        and order_line.after_service_id is not null
    )
  then
    raise exception 'AFTER_SERVICE_RECEIPT_ORDER_DELETE_FORBIDDEN';
  end if;

  if exists (
      select 1
      from public.inventory_purchase_order_lines order_line
      where order_line.order_id = old.id
        and order_line.after_service_id is null
        and (
          order_line.handling_type = 'as_exchange_in'
          or order_line.inbound_type = 'as_exchange_in'
        )
    )
    and not public.is_current_user_master()
  then
    raise exception 'MASTER_REQUIRED';
  end if;

  return old;
end;
$$;

drop trigger if exists guard_linked_after_service_order_delete_trigger
  on public.inventory_purchase_orders;
create trigger guard_linked_after_service_order_delete_trigger
before delete on public.inventory_purchase_orders
for each row execute function public.guard_linked_after_service_order_delete();

revoke all on function public.guard_linked_after_service_order_delete()
  from public, anon, authenticated;

create or replace function public.guard_linked_after_service_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.repair_receipt_id is not null
      or old.repair_receipt_order_id is not null
      or exists (
        select 1
        from public.inventory_purchase_receipts receipt
        where receipt.after_service_id = old.id
      )
      or exists (
        select 1
        from public.inventory_purchase_order_lines order_line
        where order_line.after_service_id = old.id
      )
    then
      raise exception 'AFTER_SERVICE_WITH_RECEIPT_DELETE_FORBIDDEN';
    end if;
    return old;
  end if;

  if new.repair_receipt_id is distinct from old.repair_receipt_id
    or new.repair_receipt_order_id is distinct from old.repair_receipt_order_id
  then
    if old.repair_receipt_id is not null
      or old.repair_receipt_order_id is not null
    then
      raise exception 'AFTER_SERVICE_RECEIPT_LINK_IMMUTABLE';
    end if;

    if new.repair_receipt_id is null
      or new.repair_receipt_order_id is null
      or not exists (
        select 1
        from public.inventory_purchase_receipts receipt
        where receipt.id = new.repair_receipt_id
          and receipt.order_id = new.repair_receipt_order_id
          and receipt.after_service_id = old.id
      )
      or not exists (
        select 1
        from public.inventory_purchase_order_lines order_line
        where order_line.order_id = new.repair_receipt_order_id
          and order_line.after_service_id = old.id
      )
    then
      raise exception 'AFTER_SERVICE_RECEIPT_LINK_INVALID';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_linked_after_service_record_update_trigger
  on public.after_services;
create trigger guard_linked_after_service_record_update_trigger
before update of repair_receipt_id, repair_receipt_order_id
on public.after_services
for each row execute function public.guard_linked_after_service_record();

drop trigger if exists guard_linked_after_service_record_delete_trigger
  on public.after_services;
create trigger guard_linked_after_service_record_delete_trigger
before delete on public.after_services
for each row execute function public.guard_linked_after_service_record();

revoke all on function public.guard_linked_after_service_record()
  from public, anon, authenticated;

create or replace function public.guard_linked_after_service_movement_reversal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.movement_type = 'reversal'
    and new.reversed_movement_id is not null
    and exists (
      select 1
      from public.inventory_movements original
      join public.inventory_purchase_receipts receipt
        on original.reference_type = 'purchase_receipt'
       and original.reference_id = receipt.id::text
      where original.id = new.reversed_movement_id
        and (
          receipt.after_service_id is not null
          or exists (
            select 1
            from public.after_services after_service
            where after_service.repair_receipt_id = receipt.id
          )
          or exists (
            select 1
            from public.inventory_purchase_receipt_lines receipt_line
            join public.inventory_purchase_order_lines order_line
              on order_line.id = receipt_line.order_line_id
            where receipt_line.receipt_id = receipt.id
              and (
                order_line.handling_type = 'as_exchange_in'
                or order_line.inbound_type = 'as_exchange_in'
              )
          )
        )
    )
  then
    raise exception 'AFTER_SERVICE_RECEIPT_REVERSE_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_linked_after_service_movement_reversal_trigger
  on public.inventory_movements;
create trigger guard_linked_after_service_movement_reversal_trigger
before insert on public.inventory_movements
for each row execute function public.guard_linked_after_service_movement_reversal();

revoke all on function public.guard_linked_after_service_movement_reversal()
  from public, anon, authenticated;

-- Preserve the legacy RPC signature while routing all callers through the v2
-- implementation that records reservation and confirmation actor snapshots.
create or replace function public.confirm_reservation_stamp_operation(
  p_log_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.confirm_reservation_stamp_operation_v2(p_log_id, null);
end;
$$;

revoke all on function public.confirm_reservation_stamp_operation(text)
  from public, anon, authenticated;
grant execute on function public.confirm_reservation_stamp_operation(text)
  to authenticated;

notify pgrst, 'reload schema';
