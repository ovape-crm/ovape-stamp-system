-- 입고별 할인·지불 참고 내역
-- Supabase SQL Editor에서 이 파일 전체를 실행해 주세요.

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

create index if not exists inventory_purchase_order_adjustments_order_idx
  on public.inventory_purchase_order_adjustments(order_id);

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

alter table public.inventory_purchase_adjustment_categories enable row level security;
alter table public.inventory_purchase_order_adjustments enable row level security;

drop policy if exists "authenticated read purchase adjustment categories"
  on public.inventory_purchase_adjustment_categories;
drop policy if exists "admins read purchase adjustment categories"
  on public.inventory_purchase_adjustment_categories;
create policy "admins read purchase adjustment categories"
  on public.inventory_purchase_adjustment_categories for select
  to authenticated using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );

drop policy if exists "authenticated read purchase order adjustments"
  on public.inventory_purchase_order_adjustments;
drop policy if exists "admins read purchase order adjustments"
  on public.inventory_purchase_order_adjustments;
create policy "admins read purchase order adjustments"
  on public.inventory_purchase_order_adjustments for select
  to authenticated using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );

create or replace function public.save_inventory_purchase_adjustment_category(
  p_id uuid,
  p_name text,
  p_kind text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'CATEGORY_NAME_REQUIRED';
  end if;
  if p_kind not in ('discount', 'payment') then
    raise exception 'INVALID_CATEGORY_KIND';
  end if;

  if p_id is null then
    insert into public.inventory_purchase_adjustment_categories
      (name, kind, sort_order, created_by)
    values (
      btrim(p_name),
      p_kind,
      coalesce((
        select max(sort_order) + 1
        from public.inventory_purchase_adjustment_categories
        where kind = p_kind
      ), 0),
      auth.uid()
    )
    returning id into v_id;
  else
    update public.inventory_purchase_adjustment_categories
    set name = btrim(p_name),
        kind = p_kind,
        is_active = true,
        updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.deactivate_inventory_purchase_adjustment_category(
  p_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  update public.inventory_purchase_adjustment_categories
  set is_active = false, updated_at = now()
  where id = p_id;
end;
$$;

create or replace function public.save_inventory_purchase_order_adjustments(
  p_order_id uuid,
  p_adjustments jsonb
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if not exists (
    select 1 from public.inventory_purchase_orders where id = p_order_id
  ) then
    raise exception 'PURCHASE_ORDER_NOT_FOUND';
  end if;

  delete from public.inventory_purchase_order_adjustments
  where order_id = p_order_id;

  insert into public.inventory_purchase_order_adjustments (
    order_id,
    category_id,
    category_name,
    kind,
    amount,
    note,
    created_by
  )
  select
    p_order_id,
    nullif(item->>'category_id', '')::uuid,
    btrim(item->>'category_name'),
    item->>'kind',
    greatest(0, coalesce((item->>'amount')::integer, 0)),
    nullif(btrim(item->>'note'), ''),
    auth.uid()
  from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) item
  where btrim(coalesce(item->>'category_name', '')) <> ''
    and item->>'kind' in ('discount', 'payment');
end;
$$;

revoke all on function public.save_inventory_purchase_adjustment_category(uuid, text, text) from public;
revoke all on function public.deactivate_inventory_purchase_adjustment_category(uuid) from public;
revoke all on function public.save_inventory_purchase_order_adjustments(uuid, jsonb) from public;
grant execute on function public.save_inventory_purchase_adjustment_category(uuid, text, text) to authenticated;
grant execute on function public.deactivate_inventory_purchase_adjustment_category(uuid) to authenticated;
grant execute on function public.save_inventory_purchase_order_adjustments(uuid, jsonb) to authenticated;

drop function if exists public.update_inventory_purchase_order_details(uuid, uuid, date, text, jsonb);

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
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if not exists (
    select 1 from public.inventory_suppliers
    where id = p_supplier_id
  ) then
    raise exception 'SUPPLIER_NOT_FOUND';
  end if;

  select status into v_order_status
  from public.inventory_purchase_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'PURCHASE_ORDER_NOT_FOUND';
  end if;

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
    where id = (v_line->>'id')::uuid
      and order_id = p_order_id
    for update;

    if not found then
      raise exception 'PURCHASE_ORDER_LINE_NOT_FOUND';
    end if;
    if coalesce((v_line->>'ordered_quantity')::integer, 0) < greatest(1, v_existing.received_quantity) then
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
          (v_line->>'ordered_quantity')::integer - received_quantity,
          0
        ),
        unit_price = nullif(v_line->>'unit_price', '')::integer,
        note = nullif(btrim(coalesce(v_line->>'note', '')), ''),
        handling_type = coalesce(nullif(v_line->>'handling_type', ''), v_existing.handling_type, 'none'),
        handling_note = nullif(btrim(coalesce(v_line->>'handling_note', '')), ''),
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
      and order_id = p_order_id
      and reversed_at is null;
  end loop;

  if v_order_status not in ('closed', 'cancelled') then
    update public.inventory_purchase_orders
    set status = case
      when not exists (
        select 1 from public.inventory_purchase_order_lines
        where order_id = p_order_id
          and received_quantity < ordered_quantity
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
