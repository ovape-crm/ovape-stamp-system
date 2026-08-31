insert into public.settlement_expenses(
  expense_date, category_id, category, amount, store,
  is_recurring, note, created_by, source_log_id
)
select
  (log.created_at at time zone 'Asia/Seoul')::date,
  category.id,
  case when log.jsonb->>'deliveryMethod' = 'parcel' then '택배비' else '배달대행비' end,
  (log.jsonb->>'deliveryFee')::numeric::integer,
  case when log.jsonb->>'storeName' in ('ovape', 'eguvape') then log.jsonb->>'storeName' else 'ovape' end,
  false,
  coalesce(nullif(btrim(customer.name), ''), '고객 미지정') || ',' ||
    coalesce(nullif(btrim(customer.phone), ''), '번호 없음') || ' ' ||
    case when log.jsonb->>'deliveryMethod' = 'parcel' then '택배비' else '배달대행비' end,
  log.admin_id,
  log.id
from public.logs log
join public.customers customer on customer.id = log.customer_id
join public.settlement_expense_categories category on category.name =
  case when log.jsonb->>'deliveryMethod' = 'parcel' then '택배비' else '배달대행비' end
where log.category = 'stamp'
  and (log.created_at at time zone 'Asia/Seoul')::date < date '2026-08-02'
  and (
    log.jsonb->>'deliveryMethod' = 'parcel'
    or (log.jsonb->>'deliveryMethod' = 'delivery' and log.jsonb->>'deliveryType' = 'agency')
  )
  and coalesce(log.jsonb->>'deliveryFee', '') ~ '^\\d+(\\.\\d+)?$'
  and (log.jsonb->>'deliveryFee')::numeric > 0
on conflict (source_log_id) where source_log_id is not null
  and category in ('택배비', '배달대행비')
do update set
  expense_date = excluded.expense_date,
  category_id = excluded.category_id,
  category = excluded.category,
  amount = excluded.amount,
  store = excluded.store,
  note = excluded.note,
  updated_at = now();
