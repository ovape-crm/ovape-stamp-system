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
  where exists (
      select 1 from public.users
      where id = auth.uid() and oss_role = 'master'
    )
    and btrim(receipt_line.item_name) = btrim(p_item_name)
    and receipt_line.unit_price is not null
    and receipt_line.quantity > coalesce((
      select sum(allocation.outbound_quantity)
      from public.after_service_outbound_cost_allocations allocation
      where allocation.source_receipt_line_id = receipt_line.id
    ), 0)
  order by receipt.arrived_on, receipt_line.id;
$$;

create or replace function public.confirm_inventory_service_outbound(
  p_after_service_id bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_service public.after_services%rowtype;
  v_source record;
  v_remaining integer;
  v_take integer;
  v_allocations jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then raise exception 'MASTER_REQUIRED'; end if;

  select * into v_after_service
  from public.after_services
  where id = p_after_service_id
  for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_after_service.service_case_type not in ('vendor_exchange', 'store_product_as') then
    raise exception 'INVENTORY_SERVICE_CASE_REQUIRED';
  end if;
  if v_after_service.outbound_supplier_id is null then raise exception 'SUPPLIER_REQUIRED'; end if;
  if v_after_service.outbound_processed_at is not null then
    raise exception 'OUTBOUND_ALREADY_PROCESSED';
  end if;

  v_remaining := v_after_service.quantity;
  for v_source in
    select receipt_line.id, receipt_line.unit_price,
      greatest(0, receipt_line.quantity - coalesce((
        select sum(allocation.outbound_quantity)
        from public.after_service_outbound_cost_allocations allocation
        where allocation.source_receipt_line_id = receipt_line.id
      ), 0))::integer as available_quantity
    from public.inventory_purchase_receipt_lines receipt_line
    join public.inventory_purchase_receipts receipt
      on receipt.id = receipt_line.receipt_id and receipt.reversed_at is null
    where btrim(receipt_line.item_name) = btrim(v_after_service.item_name)
      and receipt_line.unit_price is not null
    order by receipt.arrived_on, receipt_line.id
  loop
    exit when v_remaining = 0;
    if v_source.available_quantity <= 0 then continue; end if;
    v_take := least(v_remaining, v_source.available_quantity);
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'sourceReceiptLineId', v_source.id,
      'unitPrice', v_source.unit_price,
      'quantity', v_take
    ));
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 and v_after_service.service_case_type = 'vendor_exchange' then
    raise exception 'PURCHASE_COST_HISTORY_INSUFFICIENT';
  end if;
  if v_remaining > 0 then
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'sourceReceiptLineId', null,
      'unitPrice', 0,
      'quantity', v_remaining
    ));
  end if;

  perform public.process_inventory_service_outbound(
    v_after_service.id,
    v_after_service.service_case_type,
    v_after_service.outbound_supplier_id,
    v_allocations
  );
end;
$$;

create or replace function public.require_master_after_service_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then raise exception 'MASTER_REQUIRED'; end if;
  return old;
end;
$$;

drop trigger if exists require_master_after_service_delete_trigger
  on public.after_services;
create trigger require_master_after_service_delete_trigger
before delete on public.after_services
for each row execute function public.require_master_after_service_delete();

revoke all on function public.confirm_inventory_service_outbound(bigint)
  from public, anon, authenticated;
grant execute on function public.confirm_inventory_service_outbound(bigint)
  to authenticated;
