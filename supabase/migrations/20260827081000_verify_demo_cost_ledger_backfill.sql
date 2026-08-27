-- 배포 시점에 모든 유효 시연용 출고가 원가 원장에 반영됐는지 검증한다.
do $$
begin
  if exists (
    select 1
    from public.logs log
    cross join lateral jsonb_array_elements(coalesce(log.jsonb->'items', '[]'::jsonb)) with ordinality entry(item, ordinality)
    where log.category = 'stamp'
      and btrim(coalesce(item->>'inventoryAction', '')) in ('', 'out')
      and btrim(coalesce(item->>'remark', '')) ~ '^시연용($|[,\s(])'
      and btrim(coalesce(item->>'itemName', '')) <> ''
      and coalesce(nullif(item->>'quantity', '')::integer, 0) > 0
      and public.is_inventory_item_tracked(btrim(item->>'itemName'))
      and not exists (
        select 1 from public.inventory_cost_events event
        where event.reference_type = 'stamp_log'
          and event.reference_id = log.id::text
          and event.reference_line_key = entry.ordinality::text
          and event.event_type = 'demo_out'
      )
  ) then
    raise exception 'DEMO_COST_LEDGER_BACKFILL_INCOMPLETE';
  end if;

  if exists (
    select 1
    from public.inventory_cost_events event
    left join public.inventory_cost_allocations allocation on allocation.outbound_event_id = event.id
    where event.event_type = 'demo_out'
    group by event.id, event.quantity, event.settlement_effect
    having event.settlement_effect <> 'demo_expense'
      or coalesce(sum(allocation.quantity), 0) <> event.quantity
  ) then
    raise exception 'DEMO_COST_LEDGER_ALLOCATION_INVALID';
  end if;
end $$;
