-- 입고 시연용은 입고 명세의 품목을, 일반 시연용은 출고 품목을 메모로 사용한다.
create or replace function public.demo_expense_note(p_log_id bigint, p_jsonb jsonb)
returns text language sql stable set search_path=public as $$
  select coalesce(
    (
      select string_agg(line.item_name || ' ' || line.quantity::text || '개', ', ' order by line.id)
      from public.inventory_purchase_receipt_lines line
      where line.receipt_id = nullif(p_jsonb->>'purchaseReceiptId','')::uuid
    ),
    (
      select string_agg(concat_ws(' ', nullif(item->>'itemName',''), concat(coalesce(nullif(item->>'quantity',''),'1'),'개')), ', ')
      from jsonb_array_elements(coalesce(p_jsonb->'items','[]'::jsonb)) item
    )
  );
$$;

update public.settlement_expenses expense
set note = coalesce(
  nullif(concat_ws(' · ', public.demo_expense_note(log.id, log.jsonb), nullif(log.jsonb->>'extraNote','')), ''),
  expense.note
), updated_at = now()
from public.logs log
where expense.category = '시연용' and expense.source_log_id = log.id;
