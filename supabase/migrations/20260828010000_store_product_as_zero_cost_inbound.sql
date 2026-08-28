-- 매장제품 A/S는 재고 밖의 시연·무상 제품을 발송하는 흐름이다.
-- 출고 시 재고를 차감하지 않고, 실제 A/S 입고 때에만 0원 입고로 재고·원가층을 만든다.
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
  if not exists (select 1 from public.users where id = auth.uid() and oss_role = 'master') then
    raise exception 'MASTER_REQUIRED';
  end if;

  select * into v_after_service from public.after_services where id = p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_after_service.service_case_type not in ('vendor_exchange', 'store_product_as') then
    raise exception 'INVENTORY_SERVICE_CASE_REQUIRED';
  end if;
  if v_after_service.outbound_supplier_id is null then raise exception 'SUPPLIER_REQUIRED'; end if;
  if v_after_service.outbound_processed_at is not null then raise exception 'OUTBOUND_ALREADY_PROCESSED'; end if;

  if v_after_service.service_case_type = 'store_product_as' then
    insert into public.after_service_outbound_cost_allocations(
      after_service_id, source_receipt_line_id, unit_price, outbound_quantity
    ) values (v_after_service.id, null, 0, v_after_service.quantity);

    update public.after_services set
      outbound_processed_at = now(),
      status = 'sent_for_repair'
    where id = v_after_service.id;
    return;
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
      'sourceReceiptLineId', v_source.id, 'unitPrice', v_source.unit_price, 'quantity', v_take
    ));
    v_remaining := v_remaining - v_take;
  end loop;
  if v_remaining > 0 then raise exception 'PURCHASE_COST_HISTORY_INSUFFICIENT'; end if;

  perform public.process_inventory_service_outbound(
    v_after_service.id, 'vendor_exchange', v_after_service.outbound_supplier_id, v_allocations
  );
end;
$$;

-- 이전 일반 A/S 방식으로 저장된 무상 A/S 접수 2건을 0원 입고 대기 상태로 전환한다.
-- 아직 입고되지 않았으므로 재고 수량·FIFO 원가층은 지금 만들지 않는다.
do $$
declare
  v_supplier_id uuid;
begin
  select id into v_supplier_id
  from public.inventory_suppliers
  where name = '메두사'
  limit 1;
  if v_supplier_id is null then raise exception 'SUPPLIER_NOT_FOUND: 메두사'; end if;

  update public.after_services
  set service_case_type = 'store_product_as',
      outbound_supplier_id = v_supplier_id,
      outbound_processed_at = coalesce(outbound_processed_at, now())
  where id in (187, 190)
    and status = 'sent_for_repair';

  insert into public.after_service_outbound_cost_allocations(
    after_service_id, source_receipt_line_id, unit_price, outbound_quantity
  )
  select after_service.id, null, 0, after_service.quantity
  from public.after_services after_service
  where after_service.id in (187, 190)
    and after_service.status = 'sent_for_repair'
    and not exists (
      select 1 from public.after_service_outbound_cost_allocations allocation
      where allocation.after_service_id = after_service.id
    );
end;
$$;
