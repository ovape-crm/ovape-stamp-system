-- 기존 시연용 비용도 품목·수량과 작성 메모를 보여 준다.
update public.settlement_expenses expense
set note = coalesce(
  nullif(concat_ws(' · ',
    (
      select string_agg(
        concat_ws(' ', nullif(item->>'itemName',''), concat(coalesce(nullif(item->>'quantity',''),'1'),'개')),
        ', '
      )
      from jsonb_array_elements(coalesce(log.jsonb->'items','[]'::jsonb)) item
    ),
    nullif(log.jsonb->>'extraNote','')
  ), ''),
  expense.note
), updated_at = now()
from public.logs log
where expense.category = '시연용'
  and expense.source_log_id = log.id;
