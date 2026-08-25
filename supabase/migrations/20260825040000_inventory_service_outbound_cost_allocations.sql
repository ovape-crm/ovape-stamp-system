alter table public.after_services
  add column if not exists service_case_type text not null default 'customer_as',
  add column if not exists outbound_supplier_id uuid references public.inventory_suppliers(id),
  add column if not exists outbound_processed_at timestamptz;

alter table public.after_services
  drop constraint if exists after_services_service_case_type_check;
alter table public.after_services
  add constraint after_services_service_case_type_check check (
    service_case_type in ('customer_as', 'vendor_exchange', 'store_product_as')
  );

create table if not exists public.after_service_outbound_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  after_service_id bigint not null references public.after_services(id) on delete cascade,
  source_receipt_line_id uuid references public.inventory_purchase_receipt_lines(id),
  unit_price integer not null check (unit_price >= 0),
  outbound_quantity integer not null check (outbound_quantity > 0),
  received_quantity integer not null default 0 check (
    received_quantity >= 0 and received_quantity <= outbound_quantity
  ),
  created_at timestamptz not null default now()
);

create index if not exists after_service_outbound_allocations_case_idx
  on public.after_service_outbound_cost_allocations(after_service_id);

alter table public.after_service_outbound_cost_allocations enable row level security;
revoke all on public.after_service_outbound_cost_allocations from public, anon;
grant select on public.after_service_outbound_cost_allocations to authenticated;

create policy "authenticated reads A/S outbound allocations"
on public.after_service_outbound_cost_allocations for select to authenticated
using (auth.uid() is not null);

create or replace function public.get_item_purchase_cost_options(p_item_name text)
returns table(
  source_receipt_line_id uuid,
  arrived_on date,
  supplier_name text,
  unit_price integer,
  received_quantity integer
)
language sql
stable
security definer
set search_path = public
as $$
  select receipt_line.id, receipt.arrived_on, supplier.name,
    receipt_line.unit_price,
    greatest(
      0,
      receipt_line.quantity - coalesce((
        select sum(allocation.outbound_quantity)
        from public.after_service_outbound_cost_allocations allocation
        where allocation.source_receipt_line_id = receipt_line.id
      ), 0)
    )::integer
  from public.inventory_purchase_receipt_lines receipt_line
  join public.inventory_purchase_receipts receipt
    on receipt.id = receipt_line.receipt_id and receipt.reversed_at is null
  join public.inventory_purchase_orders purchase_order
    on purchase_order.id = receipt.order_id
  join public.inventory_suppliers supplier
    on supplier.id = purchase_order.supplier_id
  where auth.uid() is not null
    and btrim(receipt_line.item_name) = btrim(p_item_name)
    and receipt_line.unit_price is not null
    and receipt_line.quantity > coalesce((
      select sum(allocation.outbound_quantity)
      from public.after_service_outbound_cost_allocations allocation
      where allocation.source_receipt_line_id = receipt_line.id
    ), 0)
  order by receipt.arrived_on desc, receipt_line.id desc;
$$;

create or replace function public.process_inventory_service_outbound(
  p_after_service_id bigint,
  p_case_type text,
  p_supplier_id uuid,
  p_allocations jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_service public.after_services%rowtype;
  v_allocation jsonb;
  v_total integer;
  v_next_quantity integer;
  v_available_quantity integer;
  v_unit_price integer;
  v_source_id uuid;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_case_type not in ('vendor_exchange', 'store_product_as') then
    raise exception 'INVALID_SERVICE_CASE_TYPE';
  end if;
  if p_supplier_id is null then raise exception 'SUPPLIER_REQUIRED'; end if;

  select * into v_after_service from public.after_services
  where id = p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_after_service.customer_id is not null then raise exception 'CUSTOMER_NOT_ALLOWED'; end if;
  if v_after_service.outbound_processed_at is not null then
    raise exception 'OUTBOUND_ALREADY_PROCESSED';
  end if;

  select coalesce(sum((entry->>'quantity')::integer), 0) into v_total
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) entry;
  if v_total <> v_after_service.quantity then raise exception 'ALLOCATION_QUANTITY_MISMATCH'; end if;

  select balance.quantity into v_available_quantity
  from public.inventory_balances balance
  where balance.item_name = v_after_service.item_name
  for update;
  if coalesce(v_available_quantity, 0) < v_total then
    raise exception 'INSUFFICIENT_INVENTORY';
  end if;

  for v_allocation in select * from jsonb_array_elements(p_allocations)
  loop
    v_source_id := nullif(v_allocation->>'sourceReceiptLineId', '')::uuid;
    v_unit_price := (v_allocation->>'unitPrice')::integer;
    if v_unit_price < 0 then raise exception 'INVALID_UNIT_PRICE'; end if;
    if p_case_type = 'vendor_exchange' and v_source_id is null then
      raise exception 'PURCHASE_COST_SOURCE_REQUIRED';
    end if;
    if v_source_id is not null and not exists (
      select 1 from public.inventory_purchase_receipt_lines source_line
      where source_line.id = v_source_id
        and btrim(source_line.item_name) = btrim(v_after_service.item_name)
        and source_line.unit_price = v_unit_price
    ) then raise exception 'PURCHASE_COST_SOURCE_INVALID'; end if;
    if v_source_id is not null and (
      select source_line.quantity - coalesce((
        select sum(existing_allocation.outbound_quantity)
        from public.after_service_outbound_cost_allocations existing_allocation
        where existing_allocation.source_receipt_line_id = source_line.id
      ), 0)
      from public.inventory_purchase_receipt_lines source_line
      where source_line.id = v_source_id
      for update
    ) < (v_allocation->>'quantity')::integer then
      raise exception 'PURCHASE_COST_QUANTITY_EXCEEDED';
    end if;

    insert into public.after_service_outbound_cost_allocations(
      after_service_id, source_receipt_line_id, unit_price, outbound_quantity
    ) values (
      v_after_service.id, v_source_id, v_unit_price,
      (v_allocation->>'quantity')::integer
    );

    insert into public.inventory_balances(item_name, quantity, updated_at)
    values (v_after_service.item_name, -(v_allocation->>'quantity')::integer, now())
    on conflict(item_name) do update set
      quantity = public.inventory_balances.quantity + excluded.quantity,
      updated_at = now()
    returning quantity into v_next_quantity;

    insert into public.inventory_movements(
      item_name, movement_type, quantity_delta, quantity_after, unit_price,
      reference_type, reference_id, note, created_by,
      inventory_action, item_remark
    ) values (
      v_after_service.item_name, 'sale_out',
      -(v_allocation->>'quantity')::integer, v_next_quantity, v_unit_price,
      'after_service_outbound', v_after_service.id::text,
      case when p_case_type = 'vendor_exchange'
        then '업체 교환출고' else '매장제품 A/S 출고' end,
      auth.uid(), p_case_type,
      case when p_case_type = 'vendor_exchange'
        then '업체 교환출고' else '매장제품 A/S 출고' end
    );
  end loop;

  update public.after_services set
    service_case_type = p_case_type,
    outbound_supplier_id = p_supplier_id,
    outbound_processed_at = now(),
    supplier_name = (select name from public.inventory_suppliers where id = p_supplier_id),
    status = 'sent_for_repair'
  where id = v_after_service.id;
end;
$$;

revoke all on function public.get_item_purchase_cost_options(text) from public, anon;
revoke all on function public.process_inventory_service_outbound(bigint, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.get_item_purchase_cost_options(text) to authenticated;
grant execute on function public.process_inventory_service_outbound(bigint, text, uuid, jsonb)
  to authenticated;

create table if not exists public.after_service_inventory_receipts (
  id uuid primary key default gen_random_uuid(),
  after_service_id bigint not null references public.after_services(id) on delete cascade,
  receipt_id uuid not null references public.inventory_purchase_receipts(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique(receipt_id)
);

alter table public.after_service_inventory_receipts enable row level security;
revoke all on public.after_service_inventory_receipts from public, anon;
grant select on public.after_service_inventory_receipts to authenticated;
create policy "authenticated reads A/S inventory receipts"
on public.after_service_inventory_receipts for select to authenticated
using (auth.uid() is not null);

create or replace function public.get_inventory_service_progress(p_after_service_id bigint)
returns table(outbound_quantity integer, received_quantity integer, remaining_quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(allocation.outbound_quantity), 0)::integer,
    coalesce(sum(allocation.received_quantity), 0)::integer,
    coalesce(sum(allocation.outbound_quantity - allocation.received_quantity), 0)::integer
  from public.after_service_outbound_cost_allocations allocation
  where auth.uid() is not null
    and allocation.after_service_id = p_after_service_id;
$$;

create or replace function public.process_inventory_service_inbound(
  p_after_service_id bigint,
  p_arrived_on date,
  p_item_name text,
  p_quantity integer,
  p_memo text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_service public.after_services%rowtype;
  v_order_id uuid;
  v_order_line_id uuid;
  v_receipt_id uuid;
  v_next_quantity integer;
  v_remaining integer;
  v_take integer;
  v_allocation public.after_service_outbound_cost_allocations%rowtype;
  v_item_note text;
  v_action text;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin', 'master')
  ) then raise exception 'AUTH_REQUIRED'; end if;
  if p_arrived_on is null then raise exception 'ARRIVED_ON_REQUIRED'; end if;
  if coalesce(p_quantity, 0) <= 0 then raise exception 'QUANTITY_REQUIRED'; end if;

  select * into v_after_service from public.after_services
  where id = p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_after_service.service_case_type not in ('vendor_exchange', 'store_product_as') then
    raise exception 'INVENTORY_SERVICE_CASE_REQUIRED';
  end if;
  if btrim(coalesce(p_item_name, '')) <> btrim(v_after_service.item_name) then
    raise exception 'SERVICE_INBOUND_ITEM_MISMATCH';
  end if;
  if v_after_service.outbound_supplier_id is null then raise exception 'SUPPLIER_REQUIRED'; end if;

  select coalesce(sum(outbound_quantity - received_quantity), 0)::integer
  into v_remaining
  from public.after_service_outbound_cost_allocations
  where after_service_id = v_after_service.id;
  if p_quantity > v_remaining then raise exception 'SERVICE_INBOUND_QUANTITY_EXCEEDED'; end if;

  v_action := case when v_after_service.service_case_type = 'vendor_exchange'
    then '업체 교환입고' else '매장제품 A/S 입고' end;
  v_item_note := v_action || case
    when nullif(btrim(coalesce(p_memo, '')), '') is not null
      then '·' || btrim(p_memo) else '' end;

  insert into public.inventory_purchase_orders(supplier_id, ordered_on, status, note, created_by)
  values (v_after_service.outbound_supplier_id, p_arrived_on, 'completed', null, auth.uid())
  returning id into v_order_id;
  insert into public.inventory_purchase_receipts(order_id, arrived_on, note, created_by, after_service_id)
  values (v_order_id, p_arrived_on, null, auth.uid(), v_after_service.id)
  returning id into v_receipt_id;

  v_remaining := p_quantity;
  for v_allocation in
    select * from public.after_service_outbound_cost_allocations
    where after_service_id = v_after_service.id
      and received_quantity < outbound_quantity
    order by created_at, id
    for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_allocation.outbound_quantity - v_allocation.received_quantity);
    insert into public.inventory_purchase_order_lines(
      order_id, item_name, ordered_quantity, received_quantity, pending_quantity,
      unit_price, note, quantity_checked_by, quantity_checked_at,
      handling_type, handling_note, after_service_id, inbound_type
    ) values (
      v_order_id, btrim(p_item_name), v_take, v_take, 0,
      v_allocation.unit_price, v_item_note, auth.uid(), now(),
      'as_exchange_in', v_item_note, v_after_service.id, 'as_exchange_in'
    ) returning id into v_order_line_id;
    insert into public.inventory_purchase_receipt_lines(
      receipt_id, order_line_id, item_name, quantity, unit_price,
      quantity_checked_by, quantity_checked_at, note
    ) values (
      v_receipt_id, v_order_line_id, btrim(p_item_name), v_take,
      v_allocation.unit_price, auth.uid(), now(), v_item_note
    );
    update public.after_service_outbound_cost_allocations
    set received_quantity = received_quantity + v_take
    where id = v_allocation.id;
    insert into public.inventory_balances(item_name, quantity, updated_at)
    values (btrim(p_item_name), v_take, now())
    on conflict(item_name) do update set
      quantity = public.inventory_balances.quantity + excluded.quantity,
      updated_at = now()
    returning quantity into v_next_quantity;
    insert into public.inventory_movements(
      item_name, movement_type, quantity_delta, quantity_after, unit_price,
      reference_type, reference_id, note, created_by, counterparty_name,
      counterparty_id, inventory_action, item_remark
    ) values (
      btrim(p_item_name), 'purchase_in', v_take, v_next_quantity,
      v_allocation.unit_price, 'purchase_receipt', v_receipt_id::text,
      v_item_note, auth.uid(), v_after_service.supplier_name,
      v_after_service.outbound_supplier_id::text, 'as_exchange_in', v_action
    );
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining <> 0 then raise exception 'SERVICE_INBOUND_ALLOCATION_FAILED'; end if;
  insert into public.after_service_inventory_receipts(after_service_id, receipt_id, quantity)
  values (v_after_service.id, v_receipt_id, p_quantity);

  update public.after_services set
    status = case when exists (
      select 1 from public.after_service_outbound_cost_allocations
      where after_service_id = v_after_service.id and received_quantity < outbound_quantity
    ) then 'sent_for_repair' else 'repair_returned_completed' end,
    repair_receipt_order_id = v_order_id,
    repair_receipt_id = v_receipt_id,
    repair_receipt_item_name = btrim(p_item_name),
    repair_receipt_quantity = coalesce(repair_receipt_quantity, 0) + p_quantity,
    repair_receipt_match_type = 'match',
    repair_receipt_note = nullif(btrim(coalesce(p_memo, '')), ''),
    repair_receipt_arrived_on = p_arrived_on
  where id = v_after_service.id;

  insert into public.logs(admin_id, customer_id, action, note, jsonb, category, after_service_id)
  values (
    auth.uid(), null, 'after-service-repair_returned_completed',
    '입고일 : ' || to_char(p_arrived_on, 'YYYY/MM/DD') ||
      case when nullif(btrim(coalesce(p_memo, '')), '') is not null then E'\n' || btrim(p_memo) else '' end,
    jsonb_build_object('inventoryReceiptId', v_receipt_id, 'inventoryOrderId', v_order_id,
      'itemName', btrim(p_item_name), 'quantity', p_quantity, 'historyNote', v_item_note),
    'after_service', v_after_service.id
  );
  return v_receipt_id;
end;
$$;

revoke all on function public.get_inventory_service_progress(bigint) from public, anon;
revoke all on function public.process_inventory_service_inbound(bigint, date, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.get_inventory_service_progress(bigint) to authenticated;
grant execute on function public.process_inventory_service_inbound(bigint, date, text, integer, text)
  to authenticated;

create or replace function public.restore_inventory_service_outbound_on_as_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.after_service_outbound_cost_allocations%rowtype;
  v_next_quantity integer;
begin
  if coalesce(current_setting('app.after_service_cleanup', true), '') <> 'on' then
    raise exception 'AFTER_SERVICE_LINKED_RECORD';
  end if;
  for v_allocation in
    select * from public.after_service_outbound_cost_allocations
    where after_service_id = old.id
    order by created_at, id
  loop
    insert into public.inventory_balances(item_name, quantity, updated_at)
    values (old.item_name, v_allocation.outbound_quantity, now())
    on conflict(item_name) do update set
      quantity = public.inventory_balances.quantity + excluded.quantity,
      updated_at = now()
    returning quantity into v_next_quantity;
    insert into public.inventory_movements(
      item_name, movement_type, quantity_delta, quantity_after, unit_price,
      reference_type, reference_id, note, created_by,
      inventory_action, item_remark
    ) values (
      old.item_name, 'reversal', v_allocation.outbound_quantity,
      v_next_quantity, v_allocation.unit_price,
      'after_service_outbound_reversal', old.id::text,
      'A/S 삭제로 인한 출고 취소', auth.uid(),
      old.service_case_type, 'A/S 출고 취소'
    );
  end loop;
  return old;
end;
$$;

drop trigger if exists restore_inventory_service_outbound_on_as_delete_trigger
  on public.after_services;
create trigger restore_inventory_service_outbound_on_as_delete_trigger
before delete on public.after_services
for each row
when (old.outbound_processed_at is not null)
execute function public.restore_inventory_service_outbound_on_as_delete();
