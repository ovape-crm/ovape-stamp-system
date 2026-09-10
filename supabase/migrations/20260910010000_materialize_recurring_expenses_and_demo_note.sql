-- 반복 원본은 보존하고, 지정일이 지난 월별 비용만 실제 행으로 생성한다.
alter table public.settlement_expenses
  add column if not exists recurrence_source_id uuid references public.settlement_expenses(id) on delete restrict;

create unique index if not exists settlement_expenses_recurrence_source_date_key
  on public.settlement_expenses(recurrence_source_id, expense_date)
  where recurrence_source_id is not null;

create or replace function public.materialize_settlement_expense_recurrences(p_through date default (now() at time zone 'Asia/Seoul')::date)
returns void language plpgsql security definer set search_path=public as $$
declare template record; cursor_date date; occurrence_date date; last_day integer;
begin
  for template in select * from public.settlement_expenses where is_recurring=true and recurrence_source_id is null loop
    cursor_date := date_trunc('month', template.expense_date)::date;
    while cursor_date <= date_trunc('month', p_through)::date loop
      last_day := extract(day from (cursor_date + interval '1 month - 1 day'))::integer;
      occurrence_date := cursor_date + (least(coalesce(template.recurrence_day, extract(day from template.expense_date)::integer), last_day) - 1);
      if occurrence_date >= template.expense_date
        and occurrence_date <= p_through
        and (template.recurrence_end_date is null or occurrence_date <= template.recurrence_end_date)
        and (template.recurrence_cancelled_on is null or occurrence_date < template.recurrence_cancelled_on) then
        insert into public.settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,recurrence_source_id)
        values(occurrence_date,template.category_id,template.category,template.amount,template.store,false,template.note,template.created_by,template.id)
        on conflict (recurrence_source_id,expense_date) where recurrence_source_id is not null do nothing;
      end if;
      cursor_date := (cursor_date + interval '1 month')::date;
    end loop;
  end loop;
end $$;
revoke all on function public.materialize_settlement_expense_recurrences(date) from public,anon;
grant execute on function public.materialize_settlement_expense_recurrences(date) to authenticated;

-- 이미 등록된 월세 등도 오늘까지의 지정일 기준으로 한 번만 실제 비용 행을 만든다.
select public.materialize_settlement_expense_recurrences();

create or replace function public.sync_demo_receipt_settlement_expense()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_cost bigint; v_count integer; v_category uuid; v_date date; v_items text; v_memo text;
begin
  if tg_op='DELETE' then delete from public.settlement_expenses where source_log_id=old.id and category='시연용'; return old; end if;
  delete from public.settlement_expenses where source_log_id=new.id and category='시연용';
  if new.category<>'stamp' then return new; end if;
  select count(*),case when bool_or(total_cost is null) then null else sum(total_cost) end into v_count,v_cost from public.inventory_cost_events where reference_type='stamp_log' and reference_id=new.id::text and event_type='demo_out';
  if v_count=0 or v_cost is null or v_cost=0 then return new; end if;
  select string_agg(concat_ws(' ',nullif(item->>'itemName',''),concat(coalesce(nullif(item->>'quantity',''),'1'),'개')),', ')
    into v_items from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) item;
  v_memo := concat_ws(' · ', nullif(v_items,''), nullif(new.jsonb->>'extraNote',''));
  v_date:=(new.created_at at time zone 'Asia/Seoul')::date;
  insert into public.settlement_expense_categories(name,is_active,created_by) values('시연용',true,new.admin_id) on conflict(name) do update set is_active=true returning id into v_category;
  insert into public.settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id)
    values(v_date,v_category,'시연용',v_cost,'common',false,coalesce(nullif(v_memo,''),'시연 출고 실제 배정 원가'),new.admin_id,new.id);
  return new;
end $$;
