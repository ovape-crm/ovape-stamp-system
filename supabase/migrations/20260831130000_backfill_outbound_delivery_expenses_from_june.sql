-- 6월 1일~8월 1일 출고 이력의 실제 택배비/배달대행비를 기타비용으로 소급 반영한다.
-- 8월 2일 이후는 이전 소급 작업으로 처리되어 있으므로, 기존 비용 행을 삭제하지 않는다.
with delivery_logs as (
  select
    log.*,
    case
      when log.jsonb->>'deliveryMethod' = 'parcel' then '택배비'
      when log.jsonb->>'deliveryMethod' = 'delivery'
        and log.jsonb->>'deliveryType' = 'agency' then '배달대행비'
      when coalesce(log.note, '') ~ '택배(?:비)?[0-9]+' then '택배비'
      when coalesce(log.note, '') ~ '배달대행비[0-9]+' then '배달대행비'
    end as expense_category,
    case
      when log.jsonb->>'deliveryMethod' = 'parcel'
        or (log.jsonb->>'deliveryMethod' = 'delivery' and log.jsonb->>'deliveryType' = 'agency')
        then log.jsonb->>'deliveryFee'
      when coalesce(log.note, '') ~ '택배(?:비)?[0-9]+'
        then substring(log.note from '택배(?:비)?([0-9]+)')
      when coalesce(log.note, '') ~ '배달대행비[0-9]+'
        then substring(log.note from '배달대행비([0-9]+)')
    end as fee_text
  from public.logs log
  where log.category = 'stamp'
    and (log.created_at at time zone 'Asia/Seoul')::date >= date '2026-06-01'
    and (log.created_at at time zone 'Asia/Seoul')::date < date '2026-08-02'
)
insert into public.settlement_expenses(
  expense_date, category_id, category, amount, store,
  is_recurring, note, created_by, source_log_id
)
select
  (log.created_at at time zone 'Asia/Seoul')::date,
  category.id,
  log.expense_category,
  log.fee_text::numeric::integer,
  case when log.jsonb->>'storeName' in ('ovape', 'eguvape') then log.jsonb->>'storeName' else 'ovape' end,
  false,
  coalesce(nullif(btrim(customer.name), ''), '고객 미지정') || ',' ||
    coalesce(nullif(btrim(customer.phone), ''), '번호 없음') || ' ' || log.expense_category,
  log.admin_id,
  log.id
from delivery_logs log
join public.customers customer on customer.id = log.customer_id
join public.settlement_expense_categories category on category.name = log.expense_category
where log.expense_category is not null
  and coalesce(log.fee_text, '') ~ '^\d+(\.\d+)?$'
  and log.fee_text::numeric > 0
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
