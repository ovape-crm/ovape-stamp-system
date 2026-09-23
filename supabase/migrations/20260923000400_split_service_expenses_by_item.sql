-- One service expense per delivered item, so the settlement memo stays readable.
alter table public.settlement_expenses
  add column if not exists source_line_key text;

drop index if exists public.settlement_expenses_service_source_log_unique;
create unique index if not exists settlement_expenses_service_source_line_unique
  on public.settlement_expenses(source_log_id, source_line_key)
  where source_log_id is not null and source_line_key is not null and category = '서비스';

create or replace function public.record_service_cost_expense(p_log_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare
  line record;
  v_category_id uuid;
  v_note text;
begin
  select id into v_category_id from public.settlement_expense_categories where name='서비스';
  if v_category_id is null then
    select admin_id into v_category_id from public.logs where id=p_log_id;
    insert into public.settlement_expense_categories(name,is_active,created_by)
    values('서비스',true,v_category_id) returning id into v_category_id;
  end if;

  for line in
    select log.id, log.created_at, log.admin_id, customer.name customer_name, customer.phone,
      event.reference_line_key, event.item_name, event.quantity, event.total_cost,
      nullif(btrim(regexp_replace(coalesce(log.jsonb->'items'->((event.reference_line_key::integer)-1)->>'remark',''), '^서비스[,: ]*', '', 'i')), '') service_memo
    from public.logs log
    join public.customers customer on customer.id=log.customer_id
    join public.inventory_cost_events event on event.reference_type='stamp_log' and event.reference_id=log.id::text and event.event_type='service_out'
    where log.id=p_log_id and coalesce(event.total_cost,0)>0
  loop
    v_note:=concat_ws(' · ', line.customer_name, line.phone, line.item_name, line.quantity||'개',
      '서비스' || case when line.service_memo is null then '' else '('||line.service_memo||')' end);
    insert into public.settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id,source_line_key)
    values((line.created_at at time zone 'Asia/Seoul')::date,v_category_id,'서비스',line.total_cost,'common',false,v_note,line.admin_id,line.id,line.reference_line_key)
    on conflict(source_log_id,source_line_key) where source_log_id is not null and source_line_key is not null and category='서비스'
    do update set amount=excluded.amount,note=excluded.note,updated_at=now();
  end loop;
end $$;

-- Replace only expenses previously generated from service logs, then rebuild.
delete from public.settlement_expenses
where category='서비스' and source_log_id is not null;

do $$ declare row record; begin
  for row in select distinct reference_id::bigint id from public.inventory_cost_events where reference_type='stamp_log' and event_type='service_out'
  loop perform public.record_service_cost_expense(row.id); end loop;
end $$;
