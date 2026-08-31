-- 품목 메모에서는 4자리 연속 숫자 또는 쉼표가 포함된 금액만 배송비로 인정한다.
with legacy_items as (
  select log.*, item.value as item
  from public.logs log cross join lateral jsonb_array_elements(coalesce(log.jsonb->'items','[]'::jsonb)) item(value)
  where log.category='stamp' and item.value->>'itemName' in ('우체국택배','배달대행비')
), parsed as (
  select *, case when item->>'itemName'='우체국택배' then '택배비' else '배달대행비' end expense_category,
    replace(substring(coalesce(item->>'remark','') from '([0-9]{4,}|[0-9]{1,3}(?:,[0-9]{3})+)'),',','') fee
  from legacy_items
)
update public.settlement_expenses expense set amount=parsed.fee::integer, updated_at=now()
from parsed where expense.source_log_id=parsed.id and expense.category=parsed.expense_category
  and coalesce(parsed.fee,'') ~ '^\d+$';
