create unique index if not exists settlement_expenses_adjustment_difference_source_log_unique
  on public.settlement_expenses(source_log_id)
  where source_log_id is not null and category = '재고조정 원가차액';

create or replace function public.process_inventory_adjustment_cost_difference()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_out_cost integer;
  v_in_cost integer;
  v_amount integer;
  v_note text;
  v_category_id uuid;
begin
  if new.category <> 'stamp' then return new; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) item
    where item->>'adjustmentType' in ('correction_in','correction_out')
  ) then return new; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) item
    where item->>'adjustmentType' = 'correction_in'
  ) or not exists (
    select 1 from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) item
    where item->>'adjustmentType' = 'correction_out'
  ) then return new; end if;

  delete from public.settlement_expenses
  where source_log_id = new.id and category = '재고조정 원가차액';

  select case when count(*) filter (where event.total_cost is null) > 0 then null
              else coalesce(sum(event.total_cost), 0)::integer end
  into v_out_cost
  from public.inventory_cost_events event
  where event.reference_type = 'stamp_log'
    and event.reference_id = new.id::text
    and event.event_type = 'adjustment_out'
    and event.metadata->>'adjustmentType' = 'correction_out';

  select case when count(*) filter (where event.total_cost is null) > 0 then null
              else coalesce(sum(event.total_cost), 0)::integer end
  into v_in_cost
  from public.inventory_cost_events event
  where event.reference_type = 'stamp_log'
    and event.reference_id = new.id::text
    and event.event_type = 'adjustment_in'
    and event.metadata->>'adjustmentType' = 'correction_in';

  if v_out_cost is null or v_in_cost is null then return new; end if;
  if v_out_cost = 0 and v_in_cost = 0 then return new; end if;
  v_amount := v_out_cost - v_in_cost;
  if v_amount = 0 then return new; end if;

  select string_agg(
    case item.value->>'adjustmentType'
      when 'correction_out' then '정정 출고 '
      else '정정 입고 '
    end || item.value->>'itemName' || ' ' || item.value->>'quantity' || '개',
    ' / ' order by item.ordinality
  ) into v_note
  from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) with ordinality item(value, ordinality)
  where item.value->>'adjustmentType' in ('correction_in','correction_out');

  insert into public.settlement_expense_categories(name,is_active,created_by)
  values ('재고조정 원가차액',true,new.admin_id)
  on conflict(name) do update set is_active=true
  returning id into v_category_id;

  insert into public.settlement_expenses(
    expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id
  ) values (
    (new.created_at at time zone 'Asia/Seoul')::date,v_category_id,'재고조정 원가차액',v_amount,
    'common',false,coalesce(v_note,'재고조정 정정'),new.admin_id,new.id
  );
  return new;
end $$;

drop trigger if exists zzzz_process_inventory_adjustment_cost_difference_trigger on public.logs;
create trigger zzzz_process_inventory_adjustment_cost_difference_trigger
after insert or update of jsonb,category on public.logs
for each row execute function public.process_inventory_adjustment_cost_difference();

revoke all on function public.process_inventory_adjustment_cost_difference()
from public, anon, authenticated;
