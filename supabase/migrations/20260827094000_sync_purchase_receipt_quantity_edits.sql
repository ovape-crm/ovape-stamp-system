-- 실제 입고 수량 정정은 재고 잔량·입고 변동·FIFO 원가층을 함께 정정한다.
-- 이미 출고된 수량보다 낮게 바꾸는 것은 과거 이력을 깨므로 차단한다.
create or replace function public.sync_purchase_receipt_quantity_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_delta integer; v_consumed integer; v_layer_id uuid; v_price integer;
begin
  if new.quantity = old.quantity then return new; end if;
  select id, coalesce(unit_cost, new.unit_price) into v_layer_id, v_price
  from public.inventory_cost_layers
  where source_event_id in (select id from public.inventory_cost_events where reference_type='purchase_receipt' and reference_line_key=old.id::text)
  limit 1 for update;
  select coalesce(sum(quantity),0)::integer into v_consumed from public.inventory_cost_allocations where source_layer_id=v_layer_id;
  if new.quantity < v_consumed then raise exception 'RECEIVED_QUANTITY_ALREADY_OUTBOUND'; end if;
  v_delta := new.quantity - old.quantity;
  update public.inventory_purchase_order_lines set received_quantity=received_quantity+v_delta, pending_quantity=greatest(ordered_quantity-(received_quantity+v_delta),0) where id=new.order_line_id;
  insert into public.inventory_balances(item_name,quantity,updated_at) values(new.item_name,v_delta,now()) on conflict(item_name) do update set quantity=inventory_balances.quantity+excluded.quantity, updated_at=now();
  update public.inventory_movements set quantity_delta=quantity_delta+v_delta, unit_price=coalesce(new.unit_price,v_price) where reference_type='purchase_receipt' and reference_id=new.receipt_id::text and item_name=new.item_name and movement_type='purchase_in';
  update public.inventory_cost_layers set original_quantity=original_quantity+v_delta, remaining_quantity=remaining_quantity+v_delta where id=v_layer_id;
  update public.inventory_cost_events set quantity=quantity+v_delta, total_cost=(quantity+v_delta)*coalesce(new.unit_price,v_price) where id in (select source_event_id from public.inventory_cost_layers where id=v_layer_id);
  return new;
end;
$$;
drop trigger if exists sync_purchase_receipt_quantity_edit_trigger on public.inventory_purchase_receipt_lines;
create trigger sync_purchase_receipt_quantity_edit_trigger after update of quantity on public.inventory_purchase_receipt_lines for each row execute function public.sync_purchase_receipt_quantity_edit();
