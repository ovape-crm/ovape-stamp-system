-- Preserve the original outbound cost for a defective hold when it becomes a loss,
-- and allow the held item to be recorded as a no-stamp customer service item.
alter table public.defective_inventory_holds
  add column if not exists service_customer_id bigint references public.customers(id),
  add column if not exists service_log_id bigint references public.logs(id),
  add column if not exists scrap_log_id bigint references public.logs(id),
  add column if not exists scrap_expense_id uuid references public.settlement_expenses(id);

alter table public.defective_inventory_holds
  drop constraint if exists defective_inventory_holds_status_check;
alter table public.defective_inventory_holds
  add constraint defective_inventory_holds_status_check
  check (status in ('held', 'after_service', 'returned', 'scrapped', 'serviced'));

create or replace function public.process_defective_inventory_hold(
  p_hold_id uuid, p_action text, p_supplier_id uuid, p_settlement_type text,
  p_settlement_amount integer, p_note text, p_service_customer_id bigint default null
) returns bigint language plpgsql security definer set search_path=public as $$
declare
  hold public.defective_inventory_holds%rowtype;
  allocation record;
  v_remaining integer;
  v_cost integer := 0;
  v_category_id uuid;
  v_expense_id uuid;
  v_log_id bigint;
  v_cost_event_id uuid;
  v_adjustment_customer_id bigint;
  v_customer_name text;
  v_customer_phone text;
  v_refund_at timestamptz;
  v_history_note text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  select * into hold from public.defective_inventory_holds where id = p_hold_id for update;
  if not found or hold.status <> 'held' then raise exception 'DEFECTIVE_HOLD_NOT_AVAILABLE'; end if;

  if p_action = 'supplier_return' then
    if p_supplier_id is null or p_settlement_type not in ('supplier_credit', 'bank_refund') or coalesce(p_settlement_amount, 0) <= 0 then raise exception 'SUPPLIER_SETTLEMENT_REQUIRED'; end if;
    insert into public.supplier_refund_settlements(defective_hold_id, supplier_id, settlement_type, amount, note, created_by)
    values(hold.id, p_supplier_id, p_settlement_type, p_settlement_amount, v_note, auth.uid());
    update public.defective_inventory_holds set status = 'returned', updated_at = now() where id = hold.id;
    return null;
  end if;

  if p_action = 'service' then
    if p_service_customer_id is null or not exists(select 1 from public.customers where id = p_service_customer_id) then raise exception 'SERVICE_CUSTOMER_REQUIRED'; end if;
    insert into public.logs(admin_id, customer_id, category, action, note, jsonb)
    values(auth.uid(), p_service_customer_id, 'stamp', 'no-stamp',
      concat('불량보관 ', hold.item_name, ' ', hold.quantity, '개 서비스', case when v_note is null then '' else ' (' || v_note || ')' end),
      jsonb_build_object('paymentType', 'defective_hold_service', 'totalAmount', 0, 'defectiveHoldId', hold.id, 'items', jsonb_build_array(jsonb_build_object('itemName', hold.item_name, 'quantity', hold.quantity, 'source', 'defective_hold'))))
    returning id into v_log_id;
    update public.defective_inventory_holds set status = 'serviced', service_customer_id = p_service_customer_id, service_log_id = v_log_id, updated_at = now() where id = hold.id;
    return v_log_id;
  end if;

  if p_action <> 'scrap' then raise exception 'INVALID_DEFECTIVE_HOLD_ACTION'; end if;
  v_remaining := hold.quantity;
  for allocation in
    select a.quantity, a.unit_cost
    from public.inventory_cost_allocations a join public.inventory_cost_events e on e.id = a.outbound_event_id
    join public.customer_refund_lines line on line.id = hold.refund_line_id
    where e.reference_type = 'stamp_log' and e.reference_id = hold.source_log_id::text
      and e.reference_line_key = (line.source_line_index + 1)::text
    order by a.created_at, a.id
  loop
    exit when v_remaining <= 0;
    if allocation.unit_cost is null then raise exception 'DEFECTIVE_HOLD_COST_UNRESOLVED'; end if;
    v_cost := v_cost + least(v_remaining, allocation.quantity) * allocation.unit_cost;
    v_remaining := v_remaining - least(v_remaining, allocation.quantity);
  end loop;
  if v_remaining > 0 then raise exception 'DEFECTIVE_HOLD_COST_UNRESOLVED'; end if;

  select id into v_adjustment_customer_id
  from public.customers
  where btrim(name) = '재고조정'
  order by id
  limit 1;
  if v_adjustment_customer_id is null then raise exception 'INVENTORY_ADJUSTMENT_CUSTOMER_NOT_FOUND'; end if;

  select customer.name, customer.phone, refund.created_at
  into v_customer_name, v_customer_phone, v_refund_at
  from public.customer_refunds refund
  join public.customers customer on customer.id = hold.customer_id
  where refund.id = hold.refund_id;

  v_history_note := concat_ws(' · ',
    '반품일 ' || coalesce(to_char(v_refund_at at time zone 'Asia/Seoul', 'YYYY.MM.DD'), '확인 필요'),
    nullif(concat_ws(' ', v_customer_name, v_customer_phone), ''),
    '반품건 폐기',
    v_note
  );

  insert into public.logs(admin_id, customer_id, category, action, note, jsonb)
  values(
    auth.uid(), v_adjustment_customer_id, 'stamp', 'no-stamp', v_history_note,
    jsonb_build_object(
      'paymentType', 'defective_hold_scrap',
      'totalAmount', 0,
      'defectiveHoldId', hold.id,
      'items', jsonb_build_array(jsonb_build_object(
        'itemName', hold.item_name,
        'quantity', hold.quantity,
        'inventoryAction', 'defective_hold_scrap',
        'adjustmentType', 'loss_out',
        'adjustmentReason', 'disposal',
        'remark', '재고조정-손실 출고,폐기',
        'source', 'defective_hold'
      ))
    )
  ) returning id into v_log_id;

  insert into public.inventory_cost_events(
    event_type, event_at, item_id, item_name, direction, quantity, total_cost,
    reference_type, reference_id, reference_line_key, settlement_effect, metadata, created_by
  ) values(
    'loss_out', now(), hold.item_id, hold.item_name, 'out', hold.quantity, v_cost,
    'defective_hold', hold.id::text, 'scrap', 'inventory_loss',
    jsonb_build_object(
      'defectiveHoldId', hold.id,
      'sourceLogId', hold.source_log_id,
      'scrapLogId', v_log_id,
      'reason', 'disposal',
      'costSource', 'original_outbound'
    ), auth.uid()
  ) returning id into v_cost_event_id;

  insert into public.settlement_expense_categories(name, is_active, created_by)
  values('재고손실', true, auth.uid()) on conflict(name) do update set is_active = true returning id into v_category_id;
  insert into public.settlement_expenses(expense_date, category_id, category, amount, store, is_recurring, note, created_by, source_log_id)
  values((now() at time zone 'Asia/Seoul')::date, v_category_id, '재고손실', v_cost, 'common', false,
    concat('불량보관 ', hold.item_name, ' ', hold.quantity, '개 자체 폐기 · ', v_history_note), auth.uid(), v_log_id)
  returning id into v_expense_id;
  update public.defective_inventory_holds
  set status = 'scrapped', scrap_log_id = v_log_id, scrap_expense_id = v_expense_id, updated_at = now()
  where id = hold.id;
  return v_log_id;
end $$;

revoke all on function public.process_defective_inventory_hold(uuid, text, uuid, text, integer, text, bigint) from public, anon;
grant execute on function public.process_defective_inventory_hold(uuid, text, uuid, text, integer, text, bigint) to authenticated;
