-- 기존 출고 품목 "우체국택배"/"배달대행비"의 품목 메모에 적힌 금액을 소급 반영한다.
with legacy_items as (
  select log.*, item.value as item
  from public.logs log
  cross join lateral jsonb_array_elements(coalesce(log.jsonb->'items', '[]'::jsonb)) as item(value)
  where log.category = 'stamp'
    and (item.value->>'itemName' in ('우체국택배', '배달대행비'))
), parsed as (
  select *,
    case when item->>'itemName' = '우체국택배' then '택배비' else '배달대행비' end as expense_category,
    replace(substring(coalesce(item->>'remark','') from '([0-9][0-9,]*)'), ',', '') as fee_text
  from legacy_items
)
insert into public.settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id)
select (log.created_at at time zone 'Asia/Seoul')::date, category.id, log.expense_category,
  log.fee_text::numeric::integer,
  case when log.jsonb->>'storeName' in ('ovape','eguvape') then log.jsonb->>'storeName' else 'ovape' end,
  false, coalesce(nullif(btrim(customer.name),''),'고객 미지정')||','||coalesce(nullif(btrim(customer.phone),''),'번호 없음')||' '||log.expense_category,
  log.admin_id, log.id
from parsed log
join public.customers customer on customer.id=log.customer_id
join public.settlement_expense_categories category on category.name=log.expense_category
where coalesce(log.fee_text,'') ~ '^\d+$' and log.fee_text::numeric > 0
on conflict(source_log_id) where source_log_id is not null and category in ('택배비','배달대행비')
do update set amount=excluded.amount, category=excluded.category, category_id=excluded.category_id, note=excluded.note, updated_at=now();
