-- 이전 화면에서 먼저 저장된 전표별 잔금/지급 기록에도 입고 전표 본문을 복원한다.
insert into public.comprehensive_settlement_entries (
  entry_date,
  entry_type,
  item_name,
  quantity,
  unit_price,
  amount,
  source_receipt_id
)
select
  receipt.arrived_on,
  'receipt',
  count(receipt_line.id)::text || '개 품목 입고 전표',
  1,
  coalesce(sum(receipt_line.quantity * order_line.unit_price), 0)::integer,
  coalesce(sum(receipt_line.quantity * order_line.unit_price), 0)::integer,
  linked.related_receipt_id
from (
  select distinct related_receipt_id
  from public.comprehensive_settlement_entries
  where related_receipt_id is not null
) linked
join public.inventory_purchase_receipts receipt
  on receipt.id = linked.related_receipt_id
join public.inventory_purchase_receipt_lines receipt_line
  on receipt_line.receipt_id = receipt.id
join public.inventory_purchase_order_lines order_line
  on order_line.id = receipt_line.order_line_id
where not exists (
  select 1
  from public.comprehensive_settlement_entries existing
  where existing.source_receipt_id = linked.related_receipt_id
)
group by receipt.id, receipt.arrived_on, linked.related_receipt_id;
