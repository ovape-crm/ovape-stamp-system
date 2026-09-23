alter table public.defective_inventory_holds
  add column if not exists processing_note text;

create or replace function public.log_return_hold_processing()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_action text;
  v_note text;
  v_raw_note text;
  v_log_id bigint;
begin
  if old.status = new.status or new.status not in ('returned', 'scrapped', 'serviced') then return new; end if;
  v_action := case new.status when 'returned' then 'supplier_return' when 'scrapped' then 'scrap' else 'service' end;
  if v_action = 'supplier_return' then
    select concat_ws(' · ', '도매처 반품', case settlement_type when 'supplier_credit' then '적립금' else '계좌 환불' end, note), null
      into v_note, v_log_id
      from public.supplier_refund_settlements
      where defective_hold_id = new.id
      order by created_at desc limit 1;
  elsif v_action = 'scrap' then
    select note, id into v_note, v_log_id from public.logs where id = new.scrap_log_id;
  else
    select note, id into v_raw_note, v_log_id from public.logs where id = new.service_log_id;
    v_note := nullif(regexp_replace(coalesce(v_raw_note, ''), '^.*서비스[[:space:]]*\((.*)\)[[:space:]]*$', '\1'), '');
    if v_note = v_raw_note then v_note := null; end if;
    update public.logs
      set category = 'remark', action = 'no-stamp', note = coalesce(v_note, '반품 보관 손님 서비스'),
          jsonb = jsonb_set(coalesce(jsonb, '{}'::jsonb), '{paymentType}', '"remark"'::jsonb, true)
      where id = new.service_log_id;
  end if;
  insert into public.return_hold_processing_history(hold_id, action, note, service_customer_id, source_log_id, created_by)
  values(new.id, v_action, v_note, new.service_customer_id, v_log_id, auth.uid());
  return new;
end $$;

create or replace function public.record_defective_hold_service_expense(p_hold_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  hold public.defective_inventory_holds%rowtype;
  cost_row record;
  v_remaining integer;
  v_cost integer := 0;
  v_category_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_note text;
begin
  select * into hold from public.defective_inventory_holds where id = p_hold_id and status = 'serviced';
  if not found or hold.service_log_id is null then return; end if;
  v_remaining := hold.quantity;
  for cost_row in
    select cost_allocation.quantity, cost_allocation.unit_cost
      from public.inventory_cost_allocations cost_allocation
      join public.inventory_cost_events event on event.id = cost_allocation.outbound_event_id
      join public.customer_refund_lines line on line.id = hold.refund_line_id
      where event.reference_type = 'stamp_log'
        and event.reference_id = hold.source_log_id::text
        and event.reference_line_key = (line.source_line_index + 1)::text
      order by cost_allocation.created_at, cost_allocation.id
  loop
    exit when v_remaining <= 0;
    v_cost := v_cost + least(v_remaining, cost_row.quantity) * coalesce(cost_row.unit_cost, 0);
    v_remaining := v_remaining - least(v_remaining, cost_row.quantity);
  end loop;
  if v_remaining > 0 or v_cost <= 0 then return; end if;
  select name, phone into v_customer_name, v_customer_phone from public.customers where id = hold.service_customer_id;
  select note into v_note from public.return_hold_processing_history where hold_id = hold.id and action = 'service' order by created_at desc limit 1;
  insert into public.settlement_expense_categories(name, is_active, created_by)
    values ('서비스', true, (select admin_id from public.logs where id = hold.service_log_id))
    on conflict(name) do update set is_active = true
    returning id into v_category_id;
  insert into public.settlement_expenses(expense_date, category_id, category, amount, store, is_recurring, note, created_by, source_log_id, source_line_key)
    values ((hold.updated_at at time zone 'Asia/Seoul')::date, v_category_id, '서비스', v_cost, 'common', false,
      concat_ws(' · ', v_customer_name, v_customer_phone, hold.item_name, hold.quantity || '개', '서비스' || case when v_note is null then '' else '(' || v_note || ')' end),
      (select admin_id from public.logs where id = hold.service_log_id), hold.service_log_id, 'defective-hold-' || hold.id::text)
    on conflict(source_log_id, source_line_key) where source_log_id is not null and source_line_key is not null and category = '서비스'
    do update set amount = excluded.amount, note = excluded.note, updated_at = now();
end $$;

create or replace function public.record_defective_hold_service_expense_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status <> 'serviced' and new.status = 'serviced' then perform public.record_defective_hold_service_expense(new.id); end if;
  return new;
end $$;

drop trigger if exists zz_record_defective_hold_service_expense on public.defective_inventory_holds;
create trigger zz_record_defective_hold_service_expense
  after update of status on public.defective_inventory_holds
  for each row execute function public.record_defective_hold_service_expense_trigger();

create or replace view public.return_hold_processing_history_details
with (security_invoker = true) as
select history.id, history.action, history.note as processing_note, history.created_at as processed_at,
  hold.item_name, hold.quantity, original_customer.name as return_customer_name, original_customer.phone as return_customer_phone,
  refund.created_at as returned_at, nullif(concat_ws(' · ', nullif(hold.reason, ''), nullif(hold.memo, '')), '') as return_note,
  service_customer.name as service_customer_name, service_customer.phone as service_customer_phone
from public.return_hold_processing_history history
join public.defective_inventory_holds hold on hold.id = history.hold_id
left join public.customers original_customer on original_customer.id = hold.customer_id
left join public.customer_refunds refund on refund.id = hold.refund_id
left join public.customers service_customer on service_customer.id = history.service_customer_id;

grant select on public.return_hold_processing_history_details to authenticated;

-- Bring the already processed service case in line with the new display and accounting rules.
update public.return_hold_processing_history history
set note = nullif(regexp_replace(log.note, '^.*서비스[[:space:]]*\((.*)\)[[:space:]]*$', '\1'), '')
from public.logs log
where history.action = 'service' and history.source_log_id = log.id;

update public.logs log
set category = 'remark', action = 'no-stamp', note = coalesce(history.note, '반품 보관 손님 서비스'),
    jsonb = jsonb_set(coalesce(log.jsonb, '{}'::jsonb), '{paymentType}', '"remark"'::jsonb, true)
from public.return_hold_processing_history history
where history.action = 'service' and history.source_log_id = log.id;

do $$ declare row record; begin
  for row in select id from public.defective_inventory_holds where status = 'serviced'
  loop perform public.record_defective_hold_service_expense(row.id); end loop;
end $$;
