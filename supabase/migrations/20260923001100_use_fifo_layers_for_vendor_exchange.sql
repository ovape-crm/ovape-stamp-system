-- 업체교환 A/S의 원가 선택 목록을 별도 입고 수량 장부가 아니라
-- 재고원가 화면과 같은 실제 FIFO 원가층으로 통일한다.
drop function if exists public.get_item_purchase_cost_options(text);
create or replace function public.get_item_purchase_cost_options(p_item_name text)
returns table(
  cost_layer_id uuid,
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
  select
    layer.id,
    (source.event_at at time zone 'Asia/Seoul')::date,
    supplier.name,
    layer.unit_cost,
    layer.remaining_quantity
  from public.inventory_cost_layers layer
  join public.inventory_cost_events source on source.id = layer.source_event_id
  left join public.inventory_purchase_receipt_lines receipt_line
    on receipt_line.id::text = split_part(source.reference_line_key, ':', 1)
  left join public.inventory_purchase_receipts receipt
    on receipt.id = receipt_line.receipt_id and receipt.reversed_at is null
  left join public.inventory_purchase_orders purchase_order
    on purchase_order.id = receipt.order_id
  left join public.inventory_suppliers supplier
    on supplier.id = purchase_order.supplier_id
  where exists (
      select 1 from public.users
      where id = auth.uid() and oss_role = 'master'
    )
    and source.direction = 'in'
    and btrim(layer.item_name) = btrim(p_item_name)
    and layer.remaining_quantity > 0
    and layer.cost_status = 'confirmed'
    and layer.unit_cost is not null
  order by layer.queue_sequence, layer.id;
$$;

create or replace function public.process_inventory_service_outbound(
  p_after_service_id bigint,
  p_case_type text,
  p_supplier_id uuid,
  p_allocations jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare
  s public.after_services%rowtype;
  a record;
  v_event uuid;
  v_stock integer;
  v_at timestamptz := now();
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  select * into s from public.after_services where id=p_after_service_id for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if s.customer_id is not null or p_case_type not in ('vendor_exchange','store_product_as') or p_case_type<>s.service_case_type then raise exception 'INVALID_SERVICE_CASE_TYPE'; end if;
  if s.outbound_processed_at is not null or exists(select 1 from public.after_service_outbound_cost_allocations where after_service_id=s.id) then raise exception 'OUTBOUND_ALREADY_PROCESSED'; end if;
  if p_supplier_id is null or p_supplier_id is distinct from s.outbound_supplier_id then raise exception 'SUPPLIER_REQUIRED'; end if;

  if p_case_type='store_product_as' then
    insert into public.after_service_outbound_cost_allocations(after_service_id,unit_price,outbound_quantity) values(s.id,0,s.quantity);
  else
    perform pg_advisory_xact_lock(hashtextextended(btrim(s.item_name),0));
    select quantity into v_stock from public.inventory_balances where item_name=s.item_name for update;
    if coalesce(v_stock,0)<s.quantity then raise exception 'INSUFFICIENT_INVENTORY'; end if;

    v_event := public.allocate_inventory_cost_fifo(
      'after_service_out', v_at, null, s.item_name, s.quantity,
      'after_service_outbound', s.id::text, '', 'after_service_pending',
      jsonb_build_object('afterServiceId',s.id)
    );
    if exists(select 1 from public.inventory_cost_allocations where outbound_event_id=v_event and unit_cost is null) then
      raise exception '미확정 원가층이 있습니다. 원가를 확인한 후 업체 출고하세요.';
    end if;

    -- 화면에서 선택한 FIFO 원가층과 서버가 실제로 소진한 FIFO 원가층은 완전히 같아야 한다.
    if p_allocations is not null and p_allocations <> '[]'::jsonb then
      if (select coalesce(sum((entry->>'quantity')::integer), 0) from jsonb_array_elements(p_allocations) entry) <> s.quantity then
        raise exception 'FIFO_COST_ALLOCATION_QUANTITY_MISMATCH';
      end if;
      if exists (
        with requested as (
          select
            (entry->>'sourceCostLayerId')::uuid as cost_layer_id,
            (entry->>'unitPrice')::integer as unit_price,
            sum((entry->>'quantity')::integer)::integer as quantity
          from jsonb_array_elements(p_allocations) entry
          group by (entry->>'sourceCostLayerId')::uuid, (entry->>'unitPrice')::integer
        ), actual as (
          select source_layer_id as cost_layer_id, unit_cost as unit_price, sum(quantity)::integer as quantity
          from public.inventory_cost_allocations
          where outbound_event_id = v_event
          group by source_layer_id, unit_cost
        )
        select 1
        from requested
        full join actual using (cost_layer_id, unit_price)
        where requested.quantity is distinct from actual.quantity
      ) then
        raise exception '요청한 FIFO 원가층이 현재 재고 원가층과 다릅니다. 다시 확인하세요.';
      end if;
    end if;

    for a in
      select allocation.*, source.reference_type, source.reference_line_key
      from public.inventory_cost_allocations allocation
      join public.inventory_cost_layers layer on layer.id=allocation.source_layer_id
      join public.inventory_cost_events source on source.id=layer.source_event_id
      where allocation.outbound_event_id=v_event
      order by allocation.created_at, allocation.id
    loop
      insert into public.after_service_outbound_cost_allocations(after_service_id,source_receipt_line_id,unit_price,outbound_quantity,cost_allocation_id)
      values(
        s.id,
        case when a.reference_type='purchase_receipt' then
          (select id from public.inventory_purchase_receipt_lines where id::text=split_part(a.reference_line_key,':',1))
        else null end,
        a.unit_cost, a.quantity, a.id
      );
      update public.inventory_balances set quantity=quantity-a.quantity,updated_at=now()
      where item_name=s.item_name returning quantity into v_stock;
      insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,unit_price,reference_type,reference_id,note,created_by,inventory_action,item_remark)
      values(s.item_name,'sale_out',-a.quantity,v_stock,a.unit_cost,'after_service_outbound',s.id::text,'업체 교환출고',auth.uid(),p_case_type,'업체 교환출고');
    end loop;
  end if;

  update public.after_services set outbound_processed_at=v_at,status='sent_for_repair' where id=s.id;
end $$;

revoke all on function public.get_item_purchase_cost_options(text) from public, anon;
grant execute on function public.get_item_purchase_cost_options(text) to authenticated;
notify pgrst, 'reload schema';
