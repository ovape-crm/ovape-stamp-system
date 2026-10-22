-- 업체 불량교환은 일반 판매 FIFO가 아니라, 실제 불량이 발생한 입고 원가층을 직접 차감한다.
create or replace function public.get_item_purchase_cost_options_for_supplier(
  p_item_name text,
  p_supplier_id uuid
)
returns table(
  cost_layer_id uuid,
  arrived_on date,
  supplier_name text,
  unit_price integer,
  received_quantity integer
)
language sql stable security definer set search_path = public
as $$
  select
    layer.id,
    (source.event_at at time zone 'Asia/Seoul')::date,
    supplier.name,
    layer.unit_cost,
    layer.remaining_quantity
  from public.inventory_cost_layers layer
  join public.inventory_cost_events source on source.id = layer.source_event_id
  join public.inventory_purchase_receipt_lines receipt_line
    on receipt_line.id::text = split_part(source.reference_line_key, ':', 1)
  join public.inventory_purchase_receipts receipt
    on receipt.id = receipt_line.receipt_id and receipt.reversed_at is null
  join public.inventory_purchase_orders purchase_order on purchase_order.id = receipt.order_id
  join public.inventory_suppliers supplier on supplier.id = purchase_order.supplier_id
  where exists (select 1 from public.users where id = auth.uid() and oss_role = 'master')
    and btrim(layer.item_name) = btrim(p_item_name)
    and supplier.id = p_supplier_id
    and layer.remaining_quantity > 0
    and layer.cost_status = 'confirmed'
    and layer.unit_cost is not null
  order by source.event_at desc, layer.id;
$$;

create or replace function public.process_inventory_service_outbound(
  p_after_service_id bigint,
  p_case_type text,
  p_supplier_id uuid,
  p_allocations jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  s public.after_services%rowtype;
  a record;
  v_event uuid;
  v_allocation uuid;
  v_stock integer;
  v_total_cost integer := 0;
  v_selected_quantity integer := 0;
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
    if coalesce((select sum((entry->>'quantity')::integer) from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) entry), 0) <> s.quantity then
      raise exception 'SELECTED_RECEIPT_LAYER_QUANTITY_MISMATCH';
    end if;

    insert into public.inventory_cost_events(
      event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id,reference_line_key,settlement_effect,metadata,created_by
    ) values (
      'after_service_out',v_at,btrim(s.item_name),'out',s.quantity,0,'after_service_outbound',s.id::text,'','after_service_pending',
      jsonb_build_object('afterServiceId',s.id,'selectedReceiptLayers',true),auth.uid()
    ) returning id into v_event;

    for a in
      with requested as (
        select (entry->>'sourceCostLayerId')::uuid as cost_layer_id, sum((entry->>'quantity')::integer)::integer as quantity
        from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) entry
        group by (entry->>'sourceCostLayerId')::uuid
      )
      select requested.quantity, layer.id, layer.item_name, layer.remaining_quantity, layer.unit_cost, layer.cost_status, supplier.id as supplier_id,
        source.reference_type, source.reference_line_key
      from requested
      join public.inventory_cost_layers layer on layer.id=requested.cost_layer_id
      join public.inventory_cost_events source on source.id=layer.source_event_id
      left join public.inventory_purchase_receipt_lines receipt_line on receipt_line.id::text=split_part(source.reference_line_key,':',1)
      left join public.inventory_purchase_receipts receipt on receipt.id=receipt_line.receipt_id and receipt.reversed_at is null
      left join public.inventory_purchase_orders purchase_order on purchase_order.id=receipt.order_id
      left join public.inventory_suppliers supplier on supplier.id=purchase_order.supplier_id
      for update of layer
    loop
      if a.item_name <> btrim(s.item_name) or a.cost_status <> 'confirmed' or a.unit_cost is null or a.remaining_quantity < a.quantity or a.supplier_id is distinct from p_supplier_id then
        raise exception 'SELECTED_RECEIPT_LAYER_NOT_AVAILABLE';
      end if;
      insert into public.inventory_cost_allocations(outbound_event_id,source_layer_id,quantity,unit_cost)
      values(v_event,a.id,a.quantity,a.unit_cost)
      returning id into v_allocation;
      update public.inventory_cost_layers set remaining_quantity=remaining_quantity-a.quantity where id=a.id;
      insert into public.after_service_outbound_cost_allocations(after_service_id,source_receipt_line_id,unit_price,outbound_quantity,cost_allocation_id)
      values(s.id,case when a.reference_type='purchase_receipt' then (select id from public.inventory_purchase_receipt_lines where id::text=split_part(a.reference_line_key,':',1)) else null end,a.unit_cost,a.quantity,v_allocation);
      v_selected_quantity := v_selected_quantity+a.quantity;
      v_total_cost := v_total_cost+(a.quantity*a.unit_cost);
      update public.inventory_balances set quantity=quantity-a.quantity,updated_at=now() where item_name=s.item_name returning quantity into v_stock;
      insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,unit_price,reference_type,reference_id,note,created_by,inventory_action,item_remark)
      values(s.item_name,'sale_out',-a.quantity,v_stock,a.unit_cost,'after_service_outbound',s.id::text,'업체 교환출고',auth.uid(),p_case_type,'업체 교환출고');
    end loop;
    if v_selected_quantity <> s.quantity then raise exception 'SELECTED_RECEIPT_LAYER_NOT_AVAILABLE'; end if;
    update public.inventory_cost_events set total_cost=v_total_cost where id=v_event;
  end if;
  update public.after_services set outbound_processed_at=v_at,status='sent_for_repair' where id=s.id;
end $$;

revoke all on function public.get_item_purchase_cost_options_for_supplier(text, uuid) from public, anon;
grant execute on function public.get_item_purchase_cost_options_for_supplier(text, uuid) to authenticated;
notify pgrst, 'reload schema';
