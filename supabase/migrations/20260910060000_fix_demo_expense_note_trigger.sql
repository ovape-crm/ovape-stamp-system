create or replace function public.sync_demo_receipt_settlement_expense()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_cost bigint; v_count integer; v_category uuid; v_date date; v_note text;
begin
  if tg_op='DELETE' then delete from public.settlement_expenses where source_log_id=old.id and category='시연용'; return old; end if;
  delete from public.settlement_expenses where source_log_id=new.id and category='시연용';
  if new.category<>'stamp' then return new; end if;
  select count(*),case when bool_or(total_cost is null) then null else sum(total_cost) end into v_count,v_cost
  from public.inventory_cost_events where reference_type='stamp_log' and reference_id=new.id::text and event_type='demo_out';
  if v_count=0 or v_cost is null or v_cost=0 then return new; end if;
  v_note := nullif(concat_ws(' · ',
    (select string_agg(coalesce(nullif(item->>'lineText',''), concat_ws(' ',item->>'itemName',concat(coalesce(nullif(item->>'quantity',''),'1'),'개'))), ', ')
       from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) item),
    nullif(new.jsonb->>'extraNote','')
  ), '');
  v_date:=(new.created_at at time zone 'Asia/Seoul')::date;
  insert into public.settlement_expense_categories(name,is_active,created_by) values('시연용',true,new.admin_id) on conflict(name) do update set is_active=true returning id into v_category;
  insert into public.settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id)
  values(v_date,v_category,'시연용',v_cost,'common',false,coalesce(v_note,'시연 출고 실제 배정 원가'),new.admin_id,new.id);
  return new;
end $$;

update public.settlement_expenses expense
set note = nullif(concat_ws(' · ',
  (select string_agg(coalesce(nullif(item->>'lineText',''), concat_ws(' ',item->>'itemName',concat(coalesce(nullif(item->>'quantity',''),'1'),'개'))), ', ')
    from jsonb_array_elements(coalesce(log.jsonb->'items','[]'::jsonb)) item),
  nullif(log.jsonb->>'extraNote','')
), '')
from public.logs log
where expense.category='시연용' and expense.source_log_id=log.id
  and jsonb_array_length(coalesce(log.jsonb->'items','[]'::jsonb))>0;
