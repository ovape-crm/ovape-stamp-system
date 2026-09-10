update public.settlement_expenses expense
set note = coalesce(
  nullif(concat_ws(' · ',
    (
      select string_agg(event.item_name || ' ' || event.quantity::text || '개', ', ' order by event.id)
      from public.inventory_cost_events event
      where event.reference_type = 'stamp_log'
        and event.reference_id = expense.source_log_id::text
        and event.event_type = 'demo_out'
    ),
    nullif(log.jsonb->>'extraNote','')
  ), ''),
  expense.note
), updated_at = now()
from public.logs log
where expense.category = '시연용'
  and expense.source_log_id = log.id;
