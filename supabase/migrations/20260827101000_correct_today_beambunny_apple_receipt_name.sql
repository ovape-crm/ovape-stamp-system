do $$
declare
  v_line_id uuid;
  v_match_count integer;
begin
  select count(*) into v_match_count
  from public.inventory_purchase_order_lines order_line
  join public.inventory_purchase_receipt_lines receipt_line
    on receipt_line.order_line_id = order_line.id
  join public.inventory_purchase_receipts receipt
    on receipt.id = receipt_line.receipt_id
  where receipt.arrived_on = current_date
    and receipt.reversed_at is null
    and order_line.item_name = '빔버니엑스라지 애피'
    and order_line.unit_price = 0
    and receipt_line.quantity = 1;

  if v_match_count <> 1 then
    raise exception 'TODAY_BEAMBUNNY_APPLE_RENAME_TARGET_COUNT_%', v_match_count;
  end if;

  select order_line.id into v_line_id
  from public.inventory_purchase_order_lines order_line
  join public.inventory_purchase_receipt_lines receipt_line
    on receipt_line.order_line_id = order_line.id
  join public.inventory_purchase_receipts receipt
    on receipt.id = receipt_line.receipt_id
  where receipt.arrived_on = current_date
    and receipt.reversed_at is null
    and order_line.item_name = '빔버니엑스라지 애피'
    and order_line.unit_price = 0
    and receipt_line.quantity = 1;

  update public.inventory_purchase_order_lines
  set item_name = '빔버니리유즈 애피'
  where id = v_line_id;
end;
$$;
