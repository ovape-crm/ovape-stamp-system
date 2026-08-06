create table if not exists public.inventory_purchase_adjustment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('discount', 'payment')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, name)
);

create table if not exists public.inventory_purchase_order_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.inventory_purchase_orders(id) on delete cascade,
  category_id uuid references public.inventory_purchase_adjustment_categories(id) on delete set null,
  category_name text not null,
  kind text not null check (kind in ('discount', 'payment')),
  amount integer not null check (amount >= 0),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, category_id)
);

alter table public.inventory_purchase_order_lines
  add column if not exists handling_type text not null default 'none'
    check (handling_type in ('none', 'demo', 'reservation', 'memo')),
  add column if not exists handling_note text,
  add column if not exists customer_id bigint references public.customers(id) on delete set null,
  add column if not exists reservation_log_id text;

drop function if exists public.create_inventory_purchase_order(uuid, date, text, jsonb);

create or replace function public.create_inventory_purchase_order(
  p_supplier_id uuid,
  p_ordered_on date,
  p_note text,
  p_lines jsonb,
  p_adjustments jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_order_id uuid;
  v_entry jsonb;
  v_clean_name text;
  v_quantity integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists (
    select 1 from public.inventory_suppliers
    where id = p_supplier_id and is_use = true
  ) then raise exception '사용 가능한 거래처를 선택해 주세요.'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception '품목을 추가해 주세요.';
  end if;
  if jsonb_array_length(coalesce(p_adjustments, '[]'::jsonb)) > 0
    and not exists (
      select 1 from public.users
      where id = auth.uid() and oss_role = 'admin'
    ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  insert into public.inventory_purchase_orders
    (supplier_id, ordered_on, note, created_by)
  values
    (p_supplier_id, p_ordered_on, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_order_id;

  for v_entry in select value from jsonb_array_elements(p_lines)
  loop
    v_clean_name := btrim(v_entry->>'item_name');
    v_quantity := (v_entry->>'quantity')::integer;
    if v_clean_name = '' or v_quantity <= 0 then
      raise exception '품목과 주문 수량을 확인해 주세요.';
    end if;
    if coalesce(v_entry->>'handling_type', 'none') = 'reservation'
      and (nullif(v_entry->>'customer_id', '') is null
        or nullif(v_entry->>'reservation_log_id', '') is null) then
      raise exception '예약 고객과 예약 이력을 선택해 주세요.';
    end if;

    insert into public.inventory_purchase_order_lines (
      order_id, item_name, ordered_quantity, pending_quantity, unit_price, note,
      handling_type, handling_note, customer_id, reservation_log_id
    ) values (
      v_order_id, v_clean_name, v_quantity, v_quantity,
      nullif(v_entry->>'unit_price', '')::integer,
      nullif(btrim(v_entry->>'note'), ''),
      coalesce(nullif(v_entry->>'handling_type', ''), 'none'),
      nullif(btrim(v_entry->>'handling_note'), ''),
      nullif(v_entry->>'customer_id', '')::bigint,
      nullif(v_entry->>'reservation_log_id', '')
    );
  end loop;

  insert into public.inventory_purchase_order_adjustments (
    order_id, category_id, category_name, kind, amount, note, created_by
  )
  select
    v_order_id,
    nullif(item->>'category_id', '')::uuid,
    btrim(item->>'category_name'),
    item->>'kind',
    greatest(0, coalesce((item->>'amount')::integer, 0)),
    nullif(btrim(item->>'note'), ''),
    auth.uid()
  from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) item
  where btrim(coalesce(item->>'category_name', '')) <> ''
    and item->>'kind' in ('discount', 'payment');

  return v_order_id;
end;
$$;

revoke all on function public.create_inventory_purchase_order(uuid, date, text, jsonb, jsonb) from public;
grant execute on function public.create_inventory_purchase_order(uuid, date, text, jsonb, jsonb) to authenticated;

alter table public.inventory_purchase_receipts
  add column if not exists demo_log_id text;

create or replace function public.process_purchase_arrival(
  p_order_id uuid,
  p_arrived_on date,
  p_note text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_receipt_id uuid;
  v_line record;
  v_next_quantity integer;
  v_processed integer := 0;
  v_supplier_name text;
  v_demo_customer_id bigint;
  v_demo_log_id text;
  v_demo_items jsonb := '[]'::jsonb;
  v_demo_note text := '';
  v_demo_remark text;
  v_demo_line_text text;
  v_worker_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_arrived_on is null then raise exception '도착일을 선택해 주세요.'; end if;

  select supplier.name into v_supplier_name
  from public.inventory_purchase_orders purchase_order
  join public.inventory_suppliers supplier on supplier.id = purchase_order.supplier_id
  where purchase_order.id = p_order_id
    and purchase_order.status in ('pending', 'partial')
  for update of purchase_order;
  if not found then raise exception '입고 처리할 수 없는 주문입니다.'; end if;

  if exists (
    select 1 from public.inventory_purchase_order_lines
    where order_id = p_order_id
      and pending_quantity > 0
      and quantity_checked_at is null
  ) then raise exception '수량 체크가 완료되지 않은 품목이 있습니다.'; end if;
  if not exists (
    select 1 from public.inventory_purchase_order_lines
    where order_id = p_order_id
      and pending_quantity > 0
      and quantity_checked_at is not null
  ) then raise exception '입고 처리할 품목이 없습니다.'; end if;

  insert into public.inventory_purchase_receipts
    (order_id, arrived_on, note, created_by)
  values
    (p_order_id, p_arrived_on, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_receipt_id;

  for v_line in
    select * from public.inventory_purchase_order_lines
    where order_id = p_order_id
      and pending_quantity > 0
      and quantity_checked_at is not null
    for update
  loop
    insert into public.inventory_balances(item_name, quantity, updated_at)
    values(v_line.item_name, v_line.pending_quantity, now())
    on conflict(item_name) do update
      set quantity = public.inventory_balances.quantity + excluded.quantity,
          updated_at = now()
    returning quantity into v_next_quantity;

    insert into public.inventory_movements(
      item_name, movement_type, quantity_delta, quantity_after, unit_price,
      reference_type, reference_id, note, created_by
    ) values (
      v_line.item_name, 'purchase_in', v_line.pending_quantity, v_next_quantity,
      v_line.unit_price, 'purchase_receipt', v_receipt_id::text,
      coalesce(nullif(btrim(p_note), ''), '입고 처리'), auth.uid()
    );

    insert into public.inventory_purchase_receipt_lines(
      receipt_id, order_line_id, item_name, quantity, unit_price,
      quantity_checked_by, quantity_checked_at, note, quantity_check_note
    ) values (
      v_receipt_id, v_line.id, v_line.item_name, v_line.pending_quantity,
      v_line.unit_price, v_line.quantity_checked_by, v_line.quantity_checked_at,
      v_line.note, v_line.quantity_check_note
    );

    if v_line.handling_type = 'demo' then
      v_demo_remark := '시연용' || case
        when nullif(btrim(v_line.handling_note), '') is not null
          then ',' || btrim(v_line.handling_note)
        else ''
      end;
      v_demo_line_text := format(
        '%s %s개 (%s)',
        v_line.item_name,
        v_line.pending_quantity,
        v_demo_remark
      );
      v_demo_note := concat_ws(', ', nullif(v_demo_note, ''), v_demo_line_text);
      v_demo_items := v_demo_items || jsonb_build_array(jsonb_build_object(
        'itemId', coalesce((
          select item.id::text from public.items item
          where item.item_name = v_line.item_name
          order by item.created_at asc limit 1
        ), ''),
        'itemName', v_line.item_name,
        'quantity', v_line.pending_quantity,
        'unitPrice', 0,
        'amount', 0,
        'remark', v_demo_remark,
        'lineText', v_demo_line_text,
        'inventoryAction', 'out'
      ));
    end if;

    update public.inventory_purchase_order_lines
    set received_quantity = received_quantity + pending_quantity,
        pending_quantity = 0,
        quantity_checked_by = null,
        quantity_checked_at = null,
        quantity_check_note = null
    where id = v_line.id;
    v_processed := v_processed + 1;
  end loop;

  if jsonb_array_length(v_demo_items) > 0 then
    if not exists (
      select 1 from pg_trigger
      where tgname = 'sync_outbound_log_inventory_trigger'
        and not tgisinternal
    ) then
      raise exception 'OUTBOUND_INVENTORY_INTEGRATION_REQUIRED';
    end if;

    select customer.id into v_demo_customer_id
    from public.customers customer
    where btrim(customer.name) = '시연용'
    order by customer.created_at asc
    limit 1;
    if v_demo_customer_id is null then
      raise exception 'DEMO_CUSTOMER_NOT_FOUND';
    end if;

    select app_user.name into v_worker_name
    from public.users app_user
    where app_user.id = auth.uid();

    insert into public.logs(
      admin_id, customer_id, action, note, jsonb, category
    ) values (
      auth.uid(),
      v_demo_customer_id,
      'no-stamp',
      v_demo_note,
      jsonb_build_object(
        'paymentType', 'shipment_remark',
        'totalAmount', 0,
        'extraNote', format('%s 자동 시연용처리', v_supplier_name),
        'items', v_demo_items,
        'purchaseReceiptId', v_receipt_id::text,
        'createdWorkerName', coalesce(v_worker_name, '')
      ),
      'stamp'
    ) returning id::text into v_demo_log_id;

    update public.inventory_purchase_receipts
    set demo_log_id = v_demo_log_id
    where id = v_receipt_id;
  end if;

  update public.inventory_purchase_orders
  set status = case
        when not exists (
          select 1 from public.inventory_purchase_order_lines
          where order_id = p_order_id
            and received_quantity < ordered_quantity
        ) then 'completed'
        else 'partial'
      end,
      updated_at = now()
  where id = p_order_id;

  return v_receipt_id;
end;
$$;

create or replace function public.reverse_purchase_receipt(
  p_receipt_id uuid,
  p_reason text
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_receipt record;
  v_line record;
  v_next_quantity integer;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 완료 입고를 취소할 수 있습니다.';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception '취소 사유를 입력해 주세요.';
  end if;

  select * into v_receipt
  from public.inventory_purchase_receipts
  where id = p_receipt_id
  for update;
  if not found or v_receipt.reversed_at is not null then
    raise exception '취소할 수 없는 입고입니다.';
  end if;
  if not exists (
    select 1 from public.inventory_movements
    where reference_type = 'purchase_receipt'
      and reference_id = p_receipt_id::text
  ) then raise exception '재고 초기화 이전 입고 이력은 취소할 수 없습니다.'; end if;

  if v_receipt.demo_log_id is not null then
    delete from public.logs where id::text = v_receipt.demo_log_id;
  end if;

  for v_line in
    select * from public.inventory_purchase_receipt_lines
    where receipt_id = p_receipt_id
  loop
    update public.inventory_balances
    set quantity = quantity - v_line.quantity, updated_at = now()
    where item_name = v_line.item_name
    returning quantity into v_next_quantity;
    insert into public.inventory_movements(
      item_name, movement_type, quantity_delta, quantity_after, unit_price,
      reference_type, reference_id, note, created_by
    ) values (
      v_line.item_name, 'reversal', -v_line.quantity, v_next_quantity,
      v_line.unit_price, 'purchase_receipt_reversal', p_receipt_id::text,
      btrim(p_reason), auth.uid()
    );
    update public.inventory_purchase_order_lines
    set received_quantity = greatest(0, received_quantity - v_line.quantity)
    where id = v_line.order_line_id;
  end loop;

  update public.inventory_purchase_receipts
  set reversed_at = now(), reversed_by = auth.uid(),
      reversed_reason = btrim(p_reason), demo_log_id = null
  where id = p_receipt_id;
  update public.inventory_purchase_orders
  set status = case
        when exists (
          select 1 from public.inventory_purchase_order_lines
          where order_id = v_receipt.order_id and received_quantity > 0
        ) then 'partial' else 'pending' end,
      updated_at = now()
  where id = v_receipt.order_id;
end;
$$;

create or replace function public.delete_purchase_order_history(
  p_order_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_receipt record;
  v_line record;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 입고 이력을 삭제할 수 있습니다.';
  end if;
  if exists (
    select 1 from public.inventory_purchase_orders
    where id = p_order_id and status in ('pending', 'partial')
  ) then raise exception '입고 대기 건은 이력에서 삭제할 수 없습니다.'; end if;
  if not exists (
    select 1 from public.inventory_purchase_orders where id = p_order_id
  ) then raise exception '삭제할 입고 이력을 찾을 수 없습니다.'; end if;

  for v_receipt in
    select * from public.inventory_purchase_receipts
    where order_id = p_order_id and reversed_at is null
    for update
  loop
    if v_receipt.demo_log_id is not null then
      delete from public.logs where id::text = v_receipt.demo_log_id;
    end if;
    if exists (
      select 1 from public.inventory_movements
      where reference_type = 'purchase_receipt'
        and reference_id = v_receipt.id::text
    ) then
      for v_line in
        select * from public.inventory_purchase_receipt_lines
        where receipt_id = v_receipt.id
      loop
        update public.inventory_balances
        set quantity = quantity - v_line.quantity, updated_at = now()
        where item_name = v_line.item_name;
      end loop;
    end if;
  end loop;

  delete from public.inventory_movements
  where reference_id in (
    select id::text from public.inventory_purchase_receipts
    where order_id = p_order_id
  ) and reference_type in ('purchase_receipt', 'purchase_receipt_reversal');
  delete from public.inventory_purchase_receipts where order_id = p_order_id;
  delete from public.inventory_purchase_orders where id = p_order_id;
end;
$$;

revoke all on function public.process_purchase_arrival(uuid, date, text) from public, anon;
revoke all on function public.reverse_purchase_receipt(uuid, text) from public, anon;
revoke all on function public.delete_purchase_order_history(uuid) from public, anon;
grant execute on function public.process_purchase_arrival(uuid, date, text) to authenticated;
grant execute on function public.reverse_purchase_receipt(uuid, text) to authenticated;
grant execute on function public.delete_purchase_order_history(uuid) to authenticated;

create or replace function public.update_inventory_purchase_order_details(
  p_order_id uuid,
  p_supplier_id uuid,
  p_ordered_on date,
  p_note text,
  p_lines jsonb,
  p_receipts jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_line jsonb;
  v_existing public.inventory_purchase_order_lines%rowtype;
  v_receipt jsonb;
  v_order_status text;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (
    select 1 from public.inventory_suppliers where id = p_supplier_id
  ) then raise exception 'SUPPLIER_NOT_FOUND'; end if;

  select status into v_order_status
  from public.inventory_purchase_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;

  update public.inventory_purchase_orders
  set supplier_id = p_supplier_id,
      ordered_on = p_ordered_on,
      note = nullif(btrim(coalesce(p_note, '')), ''),
      updated_at = now()
  where id = p_order_id;

  if exists (
    select 1 from public.inventory_purchase_order_lines existing_line
    where existing_line.order_id = p_order_id
      and existing_line.received_quantity > 0
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item
        where nullif(item->>'id', '')::uuid = existing_line.id
      )
  ) then raise exception 'RECEIVED_PURCHASE_ORDER_LINE_DELETE_FORBIDDEN'; end if;

  delete from public.inventory_purchase_order_lines existing_line
  where existing_line.order_id = p_order_id
    and existing_line.received_quantity = 0
    and not exists (
      select 1 from public.inventory_purchase_receipt_lines receipt_line
      where receipt_line.order_line_id = existing_line.id
    )
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item
      where nullif(item->>'id', '')::uuid = existing_line.id
    );

  for v_line in
    select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    if nullif(v_line->>'id', '') is null then
      insert into public.inventory_purchase_order_lines (
        order_id, item_name, ordered_quantity, pending_quantity, unit_price,
        note, handling_type, handling_note, customer_id, reservation_log_id
      ) values (
        p_order_id,
        btrim(v_line->>'item_name'),
        (v_line->>'ordered_quantity')::integer,
        (v_line->>'ordered_quantity')::integer,
        nullif(v_line->>'unit_price', '')::integer,
        nullif(btrim(coalesce(v_line->>'note', '')), ''),
        coalesce(nullif(v_line->>'handling_type', ''), 'none'),
        nullif(btrim(coalesce(v_line->>'handling_note', '')), ''),
        nullif(v_line->>'customer_id', '')::bigint,
        nullif(v_line->>'reservation_log_id', '')
      );
      continue;
    end if;

    select * into v_existing
    from public.inventory_purchase_order_lines
    where id = (v_line->>'id')::uuid and order_id = p_order_id
    for update;
    if not found then raise exception 'PURCHASE_ORDER_LINE_NOT_FOUND'; end if;
    if coalesce((v_line->>'ordered_quantity')::integer, 0)
      < greatest(1, v_existing.received_quantity) then
      raise exception 'ORDERED_QUANTITY_BELOW_RECEIVED';
    end if;
    if v_existing.received_quantity > 0
      and btrim(v_line->>'item_name') <> v_existing.item_name then
      raise exception 'RECEIVED_ITEM_NAME_IMMUTABLE';
    end if;

    update public.inventory_purchase_order_lines
    set item_name = btrim(v_line->>'item_name'),
        ordered_quantity = (v_line->>'ordered_quantity')::integer,
        pending_quantity = greatest(
          (v_line->>'ordered_quantity')::integer - received_quantity, 0
        ),
        unit_price = nullif(v_line->>'unit_price', '')::integer,
        note = nullif(btrim(coalesce(v_line->>'note', '')), ''),
        handling_type = coalesce(
          nullif(v_line->>'handling_type', ''), v_existing.handling_type, 'none'
        ),
        handling_note = nullif(
          btrim(coalesce(v_line->>'handling_note', '')), ''
        ),
        customer_id = nullif(v_line->>'customer_id', '')::bigint,
        reservation_log_id = nullif(v_line->>'reservation_log_id', '')
    where id = v_existing.id;
  end loop;

  for v_receipt in
    select value from jsonb_array_elements(coalesce(p_receipts, '[]'::jsonb))
  loop
    update public.inventory_purchase_receipts
    set arrived_on = (v_receipt->>'arrived_on')::date,
        note = nullif(btrim(coalesce(v_receipt->>'note', '')), '')
    where id = (v_receipt->>'id')::uuid
      and order_id = p_order_id and reversed_at is null;
  end loop;

  if v_order_status not in ('closed', 'cancelled') then
    update public.inventory_purchase_orders
    set status = case
      when not exists (
        select 1 from public.inventory_purchase_order_lines
        where order_id = p_order_id and received_quantity < ordered_quantity
      ) then 'completed'
      when exists (
        select 1 from public.inventory_purchase_order_lines
        where order_id = p_order_id and received_quantity > 0
      ) then 'partial'
      else 'pending'
    end,
    updated_at = now()
    where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.update_inventory_purchase_order_details(uuid, uuid, date, text, jsonb, jsonb) from public;
grant execute on function public.update_inventory_purchase_order_details(uuid, uuid, date, text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
