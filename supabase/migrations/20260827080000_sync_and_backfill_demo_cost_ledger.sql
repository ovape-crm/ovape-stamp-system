-- 시연용 출고는 판매 매출원가가 아니라 시연 비용으로 FIFO 원가를 배정한다.
create or replace function public.sync_standard_outbound_cost_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_index integer := 0; v_name text; v_quantity integer; v_action text; v_remark text;
  v_event_type text; v_effect text; v_available integer; v_missing integer;
begin
  if new.category <> 'stamp' then return new; end if;
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb)) loop
    v_index := v_index + 1; v_name := btrim(coalesce(v_item->>'itemName',''));
    v_quantity := coalesce(nullif(v_item->>'quantity','')::integer,0);
    v_action := btrim(coalesce(v_item->>'inventoryAction','')); v_remark := btrim(coalesce(v_item->>'remark',''));
    if v_name = '' or v_quantity <= 0 or not public.is_inventory_item_tracked(v_name) then continue; end if;
    if v_action in ('exchange_in','exchange_out') then continue; end if;
    if v_action = 'adjustment_in' then
      perform public.create_inventory_cost_layer('adjustment_in',new.created_at,null,v_name,v_quantity,null,'pending','front',
        'stamp_log',new.id::text,v_index::text,null,jsonb_build_object('customerId',new.customer_id,'memo',v_remark));
      continue;
    end if;
    if v_action = 'adjustment_out' then v_event_type := 'adjustment_out'; v_effect := 'none';
    elsif v_action = 'as_exchange_out' then v_event_type := 'after_service_out'; v_effect := 'after_service_pending';
    elsif v_action in ('','out') and v_remark ~ '^시연용($|[,\s(])'
      then v_event_type := 'demo_out'; v_effect := 'demo_expense';
    elsif v_action in ('','out') and v_remark !~ '^(서비스|교환입고|교환출고|A/S 교환출고|재고조정-(입고|출고))($|[,\s(])'
      then v_event_type := 'sale_out'; v_effect := 'sale_cogs';
    else continue; end if;
    select coalesce(sum(remaining_quantity),0)::integer into v_available from public.inventory_cost_layers
      where item_name=v_name and remaining_quantity>0;
    v_missing := greatest(0,v_quantity-v_available);
    if v_missing>0 then perform public.create_inventory_cost_layer('opening',new.created_at-interval '1 microsecond',null,v_name,
      v_missing,null,'pending','back','cost_missing',new.id::text,v_index::text,null,jsonb_build_object('reason','live cost missing')); end if;
    perform public.allocate_inventory_cost_fifo(v_event_type,new.created_at,null,v_name,v_quantity,'stamp_log',new.id::text,
      v_index::text,v_effect,jsonb_build_object('customerId',new.customer_id,'memo',v_remark));
  end loop; return new;
end $$;

revoke all on function public.sync_standard_outbound_cost_ledger() from public,anon,authenticated;

-- 과거에 생성됐지만 원가 이벤트가 누락된 시연용 출고를 한 번만 보정한다.
do $$
declare
  v_actor uuid;
  v_log record;
  v_item jsonb;
  v_index integer;
  v_name text;
  v_quantity integer;
  v_item_id bigint;
  v_available integer;
  v_missing integer;
begin
  select id into v_actor from public.users where oss_role = 'master' order by created_at limit 1;
  if v_actor is null then raise exception 'MASTER_REQUIRED_FOR_DEMO_COST_BACKFILL'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);

  for v_log in
    select log.id, log.created_at, log.customer_id, log.jsonb
    from public.logs log
    where log.category = 'stamp'
      and exists (
        select 1 from jsonb_array_elements(coalesce(log.jsonb->'items', '[]'::jsonb)) entry(item)
        where btrim(coalesce(item->>'inventoryAction', '')) in ('', 'out')
          and btrim(coalesce(item->>'remark', '')) ~ '^시연용($|[,\s(])'
      )
    order by log.created_at, log.id
  loop
    v_index := 0;
    for v_item in select value from jsonb_array_elements(coalesce(v_log.jsonb->'items', '[]'::jsonb)) loop
      v_index := v_index + 1;
      if btrim(coalesce(v_item->>'inventoryAction', '')) not in ('', 'out')
        or btrim(coalesce(v_item->>'remark', '')) !~ '^시연용($|[,\s(])' then continue; end if;
      if exists (
        select 1 from public.inventory_cost_events event
        where event.reference_type = 'stamp_log' and event.reference_id = v_log.id::text
          and event.reference_line_key = v_index::text and event.event_type = 'demo_out'
      ) then continue; end if;
      v_name := btrim(coalesce(v_item->>'itemName', ''));
      v_quantity := coalesce(nullif(v_item->>'quantity', '')::integer, 0);
      v_item_id := case when coalesce(v_item->>'itemId', '') ~ '^[0-9]+$' then (v_item->>'itemId')::bigint else null end;
      if v_item_id is not null and not exists (select 1 from public.items where id = v_item_id) then v_item_id := null; end if;
      if v_name = '' or v_quantity <= 0 or not public.is_inventory_item_tracked(v_name) then continue; end if;
      select coalesce(sum(remaining_quantity), 0)::integer into v_available
      from public.inventory_cost_layers where item_name = v_name and remaining_quantity > 0;
      v_missing := greatest(0, v_quantity - v_available);
      if v_missing > 0 then
        perform public.create_inventory_cost_layer('opening', v_log.created_at - interval '1 microsecond', v_item_id, v_name,
          v_missing, null, 'pending', 'back', 'cost_missing', v_log.id::text, v_index::text, null,
          jsonb_build_object('reason', 'demo cost backfill quantity missing'));
      end if;
      perform public.allocate_inventory_cost_fifo('demo_out', v_log.created_at, v_item_id, v_name, v_quantity,
        'stamp_log', v_log.id::text, v_index::text, 'demo_expense',
        jsonb_build_object('customerId', v_log.customer_id, 'backfilled', true, 'memo', btrim(coalesce(v_item->>'remark', ''))));
    end loop;
  end loop;
end $$;
