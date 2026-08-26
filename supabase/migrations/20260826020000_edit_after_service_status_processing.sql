create or replace function public.get_after_service_intake_expense(
  p_after_service_id bigint
) returns table(
  expense_date date,
  has_store_cost boolean,
  store_cost_amount integer
)
language sql
stable
security definer
set search_path = public
as $$
  select expense.expense_date, true, expense.amount
  from public.settlement_expenses expense
  where auth.uid() is not null
    and expense.after_service_id = p_after_service_id
    and expense.category = 'A/S 접수비'
  limit 1;
$$;

create or replace function public.edit_after_service_status_processing(
  p_after_service_id bigint,
  p_status text,
  p_status_date date,
  p_memo text default null,
  p_has_store_cost boolean default false,
  p_store_cost_amount integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_service public.after_services%rowtype;
  v_customer public.customers%rowtype;
  v_category_id uuid;
  v_log_note text;
  v_date_label text;
  v_expense_note text;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin', 'master')
  ) then raise exception 'AUTH_REQUIRED'; end if;
  if p_status_date is null then raise exception 'STATUS_DATE_REQUIRED'; end if;

  select * into v_after_service
  from public.after_services
  where id = p_after_service_id
  for update;
  if not found then raise exception 'AFTER_SERVICE_NOT_FOUND'; end if;
  if v_after_service.status <> p_status then
    raise exception 'AFTER_SERVICE_STATUS_CHANGED';
  end if;
  if coalesce(p_has_store_cost, false)
    and coalesce(p_store_cost_amount, 0) <= 0
  then raise exception 'STORE_REPAIR_COST_REQUIRED'; end if;

  if v_after_service.customer_id is not null then
    select * into v_customer from public.customers
    where id = v_after_service.customer_id;
  end if;

  v_date_label := case p_status
    when 'sent_for_repair' then '접수일'
    when 'repair_returned' then '입고일'
    when 'repair_returned_completed' then '입고일'
    when 'customer_received' then '수령일'
    when 'repair_rejected' then 'A/S 불가 처리일'
    when 'returned' then '반품일'
    when 'other_completed' then '완료일'
    when 'other_received' then '작성일'
    else '처리일'
  end;
  v_log_note := v_date_label || ' : ' || to_char(p_status_date, 'YYYY/MM/DD') ||
    case when nullif(btrim(coalesce(p_memo, '')), '') is not null
      then E'\n' || btrim(p_memo) else '' end;

  update public.logs
  set note = v_log_note, updated_at = now()
  where id = (
    select log.id from public.logs log
    where log.after_service_id = p_after_service_id
      and log.category = 'after_service'
      and log.action = 'after-service-' || p_status
    order by log.created_at desc, log.id desc
    limit 1
  );

  if p_status = 'sent_for_repair' then
    if coalesce(p_has_store_cost, false) then
      insert into public.settlement_expense_categories(name, is_active, created_by)
      values ('A/S 접수비', true, auth.uid())
      on conflict(name) do update set is_active = true
      returning id into v_category_id;

      v_expense_note :=
        coalesce(nullif(btrim(v_customer.name), ''), '고객 미지정') || ',' ||
        coalesce(nullif(btrim(v_customer.phone), ''), '번호 없음') || ' ' ||
        coalesce(nullif(btrim(v_after_service.item_name), ''), '제품 미지정') || ' ' ||
        v_after_service.quantity::text || '개 A/S 접수비 (' ||
        coalesce(nullif(btrim(v_after_service.supplier_name), ''), '거래처 미지정') || ')';

      insert into public.settlement_expenses(
        expense_date, category_id, category, amount, store,
        is_recurring, note, created_by, after_service_id
      ) values (
        p_status_date, v_category_id, 'A/S 접수비', p_store_cost_amount,
        'ovape', false, v_expense_note, auth.uid(), p_after_service_id
      )
      on conflict (after_service_id) where
        after_service_id is not null and category = 'A/S 접수비'
      do update set
        expense_date = excluded.expense_date,
        category_id = excluded.category_id,
        amount = excluded.amount,
        note = excluded.note,
        updated_at = now();
    else
      delete from public.settlement_expenses
      where after_service_id = p_after_service_id
        and category = 'A/S 접수비';
    end if;
  elsif p_status = 'repair_returned_completed' then
    if v_after_service.repair_receipt_id is null then
      raise exception 'AFTER_SERVICE_RECEIPT_NOT_FOUND';
    end if;
    update public.after_services set
      repair_receipt_arrived_on = p_status_date,
      repair_receipt_note = nullif(btrim(coalesce(p_memo, '')), '')
    where id = p_after_service_id;
    update public.inventory_purchase_receipts set arrived_on = p_status_date
    where id = v_after_service.repair_receipt_id;
    update public.inventory_purchase_orders set ordered_on = p_status_date
    where id = v_after_service.repair_receipt_order_id;
  end if;
end;
$$;

revoke all on function public.get_after_service_intake_expense(bigint)
  from public, anon, authenticated;
grant execute on function public.get_after_service_intake_expense(bigint)
  to authenticated;
revoke all on function public.edit_after_service_status_processing(
  bigint, text, date, text, boolean, integer
) from public, anon, authenticated;
grant execute on function public.edit_after_service_status_processing(
  bigint, text, date, text, boolean, integer
) to authenticated;
