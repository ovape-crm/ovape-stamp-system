-- Service outbound costs belong to settlement expenses, not sales COGS.
create unique index if not exists settlement_expenses_service_source_log_unique
  on public.settlement_expenses(source_log_id)
  where source_log_id is not null and category='서비스';

create or replace function public.record_service_cost_expense(p_log_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare v_cost integer; v_category_id uuid; v_name text; v_phone text; v_memo text; v_date timestamptz; v_created_by uuid; v_hold_id uuid; v_return_date timestamptz; v_return_name text; v_return_phone text; v_return_memo text;
begin
  select coalesce(sum(event.total_cost),0)::integer, customer.name, customer.phone, log.note, log.created_at, log.admin_id
  into v_cost,v_name,v_phone,v_memo,v_date,v_created_by
  from public.logs log join public.customers customer on customer.id=log.customer_id
  join public.inventory_cost_events event on event.reference_type='stamp_log' and event.reference_id=log.id::text and event.event_type='service_out'
  where log.id=p_log_id group by customer.name,customer.phone,log.note,log.created_at,log.admin_id;
  select nullif(log.jsonb->>'defectiveHoldId','')::uuid into v_hold_id from public.logs log where log.id=p_log_id;
  if v_hold_id is not null then
    select coalesce(sum(allocation.quantity * allocation.unit_cost),0)::integer, refund.created_at, original_customer.name, original_customer.phone, refund.memo
    into v_cost,v_return_date,v_return_name,v_return_phone,v_return_memo
    from public.defective_inventory_holds hold
    join public.customer_refunds refund on refund.id=hold.refund_id
    join public.customers original_customer on original_customer.id=hold.customer_id
    join public.customer_refund_lines line on line.id=hold.refund_line_id
    join public.inventory_cost_events event on event.reference_type='stamp_log' and event.reference_id=hold.source_log_id::text and event.reference_line_key=(line.source_line_index+1)::text
    join public.inventory_cost_allocations allocation on allocation.outbound_event_id=event.id
    where hold.id=v_hold_id
    group by refund.created_at,original_customer.name,original_customer.phone,refund.memo;
  end if;
  if coalesce(v_cost,0)<=0 then return; end if;
  insert into public.settlement_expense_categories(name,is_active,created_by)
  values('서비스',true,v_created_by) on conflict(name) do update set is_active=true returning id into v_category_id;
  insert into public.settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id)
  values((v_date at time zone 'Asia/Seoul')::date,v_category_id,'서비스',v_cost,'common',false,
    case when v_hold_id is null then concat_ws(' ',v_name,v_phone,'서비스',case when nullif(btrim(coalesce(v_memo,'')),'') is null then null else '('||btrim(v_memo)||')' end)
      else concat_ws(' -> ', concat_ws(', ','반품일 '||to_char(v_return_date at time zone 'Asia/Seoul','YYYY.MM.DD'),v_return_name,v_return_phone,nullif(btrim(coalesce(v_return_memo,'')),'')), concat_ws(', ','서비스일 '||to_char(v_date at time zone 'Asia/Seoul','YYYY.MM.DD'),v_name,v_phone,nullif(btrim(coalesce(v_memo,'')),''))) end,v_created_by,p_log_id)
  on conflict(source_log_id) where source_log_id is not null and category='서비스'
  do update set amount=excluded.amount,note=excluded.note,updated_at=now();
end $$;

create or replace function public.process_service_cost_expense() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.category='stamp' then perform public.record_service_cost_expense(new.id); end if;
  return new;
end $$;
drop trigger if exists zzzz_process_service_cost_expense_trigger on public.logs;
create trigger zzzz_process_service_cost_expense_trigger after insert on public.logs
for each row execute function public.process_service_cost_expense();

do $$ declare row record; begin
  for row in select distinct log.id from public.logs log join public.inventory_cost_events event on event.reference_type='stamp_log' and event.reference_id=log.id::text and event.event_type='service_out'
  loop perform public.record_service_cost_expense(row.id); end loop;
end $$;
