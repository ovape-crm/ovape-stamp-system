-- Allow only the dedicated cleanup transaction to pass the linked-record guards.
drop trigger if exists guard_after_service_exchange_in_line_delete_trigger
  on public.inventory_purchase_order_lines;
create trigger guard_after_service_exchange_in_line_delete_trigger
before delete on public.inventory_purchase_order_lines
for each row
when (coalesce(current_setting('app.after_service_cleanup', true), '') <> 'on')
execute function public.guard_after_service_exchange_in_line();

drop trigger if exists guard_linked_after_service_receipt_update_trigger
  on public.inventory_purchase_receipts;
create trigger guard_linked_after_service_receipt_update_trigger
before update of reversed_at, after_service_id, order_id
on public.inventory_purchase_receipts
for each row
when (coalesce(current_setting('app.after_service_cleanup', true), '') <> 'on')
execute function public.guard_linked_after_service_receipt();

drop trigger if exists guard_linked_after_service_receipt_delete_trigger
  on public.inventory_purchase_receipts;
create trigger guard_linked_after_service_receipt_delete_trigger
before delete on public.inventory_purchase_receipts
for each row
when (coalesce(current_setting('app.after_service_cleanup', true), '') <> 'on')
execute function public.guard_linked_after_service_receipt();

drop trigger if exists guard_linked_after_service_order_delete_trigger
  on public.inventory_purchase_orders;
create trigger guard_linked_after_service_order_delete_trigger
before delete on public.inventory_purchase_orders
for each row
when (coalesce(current_setting('app.after_service_cleanup', true), '') <> 'on')
execute function public.guard_linked_after_service_order_delete();

drop trigger if exists guard_linked_after_service_record_update_trigger
  on public.after_services;
create trigger guard_linked_after_service_record_update_trigger
before update of repair_receipt_id, repair_receipt_order_id
on public.after_services
for each row
when (coalesce(current_setting('app.after_service_cleanup', true), '') <> 'on')
execute function public.guard_linked_after_service_record();

drop trigger if exists guard_linked_after_service_record_delete_trigger
  on public.after_services;
create trigger guard_linked_after_service_record_delete_trigger
before delete on public.after_services
for each row
when (coalesce(current_setting('app.after_service_cleanup', true), '') <> 'on')
execute function public.guard_linked_after_service_record();

drop trigger if exists guard_linked_after_service_movement_reversal_trigger
  on public.inventory_movements;
create trigger guard_linked_after_service_movement_reversal_trigger
before insert on public.inventory_movements
for each row
when (coalesce(current_setting('app.after_service_cleanup', true), '') <> 'on')
execute function public.guard_linked_after_service_movement_reversal();

create or replace function public.delete_after_service_with_inventory_cleanup(
  p_after_service_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_service public.after_services%rowtype;
  v_receipt record;
  v_receipt_line record;
  v_log record;
  v_next_quantity integer;
  v_outbound_count integer := 0;
  v_inbound_count integer := 0;
  v_order_count integer := 0;
begin
  if not exists (
    select 1
    from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_after_service
  from public.after_services
  where id = p_after_service_id
  for update;

  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;

  perform set_config('app.after_service_cleanup', 'on', true);

  -- Deleting managed outbound logs runs sync_outbound_log_inventory(), which
  -- restores stock and writes an outbound_cancel movement.
  for v_log in
    select id
    from public.logs
    where after_service_id = v_after_service.id
      and category = 'stamp'
      and jsonb->>'afterServiceOperation' in ('exchange', 'cost')
    for update
  loop
    delete from public.logs where id = v_log.id;
    v_outbound_count := v_outbound_count + 1;
  end loop;

  -- Reverse every official inbound receipt while retaining the original and
  -- cancellation inventory movements as the audit trail.
  for v_receipt in
    select receipt.id, receipt.order_id
    from public.inventory_purchase_receipts receipt
    where receipt.after_service_id = v_after_service.id
      or receipt.id = v_after_service.repair_receipt_id
      or exists (
        select 1
        from public.inventory_purchase_order_lines order_line
        where order_line.order_id = receipt.order_id
          and order_line.after_service_id = v_after_service.id
      )
    for update of receipt
  loop
    for v_receipt_line in
      select *
      from public.inventory_purchase_receipt_lines
      where receipt_id = v_receipt.id
    loop
      insert into public.inventory_balances(item_name, quantity, updated_at)
      values (v_receipt_line.item_name, -v_receipt_line.quantity, now())
      on conflict(item_name) do update
        set quantity = public.inventory_balances.quantity + excluded.quantity,
            updated_at = now()
      returning quantity into v_next_quantity;

      insert into public.inventory_movements(
        item_name, movement_type, quantity_delta, quantity_after, unit_price,
        reference_type, reference_id, note, created_by,
        counterparty_name, counterparty_id, inventory_action, item_remark
      ) values (
        v_receipt_line.item_name, 'reversal', -v_receipt_line.quantity,
        v_next_quantity, v_receipt_line.unit_price,
        'purchase_receipt_reversal', v_receipt.id::text,
        'A/S 삭제로 인한 입고 취소', auth.uid(),
        null, v_after_service.customer_id::text,
        'as_exchange_in', 'A/S 교환입고 취소'
      );
      v_inbound_count := v_inbound_count + 1;
    end loop;

    delete from public.inventory_purchase_receipt_lines
    where receipt_id = v_receipt.id;
    delete from public.inventory_purchase_receipts
    where id = v_receipt.id;

    delete from public.inventory_purchase_order_adjustments
    where order_id = v_receipt.order_id;
    delete from public.inventory_purchase_order_lines
    where order_id = v_receipt.order_id;
    delete from public.inventory_purchase_orders
    where id = v_receipt.order_id;
    v_order_count := v_order_count + 1;
  end loop;

  delete from public.logs where after_service_id = v_after_service.id;
  delete from public.after_services where id = v_after_service.id;

  return jsonb_build_object(
    'outboundLogsCancelled', v_outbound_count,
    'inboundLinesCancelled', v_inbound_count,
    'ordersDeleted', v_order_count
  );
end;
$$;

revoke all on function public.delete_after_service_with_inventory_cleanup(bigint)
  from public, anon, authenticated;
grant execute on function public.delete_after_service_with_inventory_cleanup(bigint)
  to authenticated;
