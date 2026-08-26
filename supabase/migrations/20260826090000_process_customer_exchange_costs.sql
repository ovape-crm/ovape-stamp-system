alter table public.settlement_expenses
  drop constraint if exists settlement_expenses_amount_check;
alter table public.settlement_expenses
  add constraint settlement_expenses_amount_check check (amount <> 0);

create unique index if not exists settlement_expenses_exchange_source_log_unique
  on public.settlement_expenses(source_log_id)
  where source_log_id is not null and category = '고객 교환 원가차액';

create or replace function public.process_customer_exchange_cost_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_item jsonb;
  v_index integer := 0;
  v_name text;
  v_quantity integer;
  v_action text;
  v_available integer;
  v_missing integer;
  v_out_event uuid;
  v_source_event uuid;
  v_source_allocation record;
  v_restore_remaining integer;
  v_restore_quantity integer;
  v_segment integer;
  v_out_cost integer;
  v_in_cost integer;
  v_difference integer;
  v_category_id uuid;
  v_out_summary text := '';
  v_in_summary text := '';
begin
  if new.category <> 'stamp' or new.customer_id is null then return new; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb)) entry(item)
    where entry.item->>'inventoryAction' in ('exchange_in', 'exchange_out')
  ) then return new; end if;
  select * into v_customer from public.customers where id = new.customer_id;

  -- 같은 처리 안에서는 교환출고를 먼저 기존 FIFO에서 차감합니다.
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb))
    with ordinality entry(value, ordinality)
    where value->>'inventoryAction' = 'exchange_out'
    order by ordinality
  loop
    v_index := v_index + 1;
    v_name := btrim(v_item->>'itemName');
    v_quantity := (v_item->>'quantity')::integer;
    select coalesce(sum(remaining_quantity), 0)::integer into v_available
    from public.inventory_cost_layers where item_name = v_name and remaining_quantity > 0;
    v_missing := greatest(0, v_quantity - v_available);
    if v_missing > 0 then
      perform public.create_inventory_cost_layer(
        'opening', new.created_at - interval '1 microsecond', null, v_name,
        v_missing, null, 'pending', 'back', 'cost_missing', new.id::text,
        'exchange-out:' || v_index::text, null,
        jsonb_build_object('reason', 'customer exchange outbound cost missing')
      );
    end if;
    v_out_event := public.allocate_inventory_cost_fifo(
      'customer_exchange_out', new.created_at, null, v_name, v_quantity,
      'stamp_log', new.id::text, 'exchange-out:' || v_index::text,
      'customer_exchange_difference',
      jsonb_build_object('customerId', new.customer_id)
    );
    v_out_summary := concat_ws(', ', nullif(v_out_summary, ''), v_name || ' ' || v_quantity || '개');
  end loop;

  v_index := 0;
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb))
    with ordinality entry(value, ordinality)
    where value->>'inventoryAction' = 'exchange_in'
    order by ordinality
  loop
    v_index := v_index + 1;
    v_name := btrim(v_item->>'itemName');
    v_quantity := (v_item->>'quantity')::integer;
    v_restore_remaining := v_quantity;
    v_segment := 0;
    select event.id into v_source_event
    from public.inventory_cost_events event
    where event.reference_type = 'stamp_log'
      and event.reference_id = nullif(v_item->>'costSourceSaleLogId', '')
      and event.reference_line_key = coalesce(v_item->>'costSourceSaleLineIndex', '')
      and event.event_type = 'sale_out'
    order by event.created_at desc limit 1;

    if v_source_event is not null then
      for v_source_allocation in
        select allocation.*, layer.item_id
        from public.inventory_cost_allocations allocation
        join public.inventory_cost_layers layer on layer.id = allocation.source_layer_id
        where allocation.outbound_event_id = v_source_event
        order by allocation.created_at, allocation.id
      loop
        exit when v_restore_remaining = 0;
        v_restore_quantity := least(v_restore_remaining, v_source_allocation.quantity);
        v_segment := v_segment + 1;
        perform public.create_inventory_cost_layer(
          'customer_exchange_in', new.created_at, v_source_allocation.item_id,
          v_name, v_restore_quantity, v_source_allocation.unit_cost,
          case when v_source_allocation.unit_cost is null then 'pending' else 'confirmed' end,
          'front', 'stamp_log', new.id::text,
          'exchange-in:' || v_index::text || ':' || v_segment::text,
          v_source_allocation.source_layer_id,
          jsonb_build_object(
            'customerId', new.customer_id,
            'sourceSaleLogId', v_item->>'costSourceSaleLogId',
            'sourceSaleLineIndex', v_item->>'costSourceSaleLineIndex'
          )
        );
        v_restore_remaining := v_restore_remaining - v_restore_quantity;
      end loop;
    end if;
    if v_restore_remaining > 0 then
      v_segment := v_segment + 1;
      perform public.create_inventory_cost_layer(
        'customer_exchange_in', new.created_at, null, v_name,
        v_restore_remaining, null, 'pending', 'front', 'stamp_log', new.id::text,
        'exchange-in:' || v_index::text || ':' || v_segment::text, null,
        jsonb_build_object(
          'customerId', new.customer_id,
          'sourceSaleLogId', v_item->>'costSourceSaleLogId',
          'sourceSaleLineIndex', v_item->>'costSourceSaleLineIndex',
          'reason', 'original sale cost missing'
        )
      );
    end if;
    v_in_summary := concat_ws(', ', nullif(v_in_summary, ''), v_name || ' ' || v_quantity || '개');
  end loop;

  select case when count(*) filter(where total_cost is null) > 0 then null else coalesce(sum(total_cost), 0)::integer end
  into v_out_cost from public.inventory_cost_events
  where reference_type = 'stamp_log' and reference_id = new.id::text
    and event_type = 'customer_exchange_out';
  select case when count(*) filter(where total_cost is null) > 0 then null else coalesce(sum(total_cost), 0)::integer end
  into v_in_cost from public.inventory_cost_events
  where reference_type = 'stamp_log' and reference_id = new.id::text
    and event_type = 'customer_exchange_in';

  if v_out_cost is not null and v_in_cost is not null then
    v_difference := v_out_cost - v_in_cost;
    if v_difference <> 0 then
      insert into public.settlement_expense_categories(name, is_active, created_by)
      values ('고객 교환 원가차액', true, new.admin_id)
      on conflict(name) do update set is_active = true returning id into v_category_id;
      insert into public.settlement_expenses(
        expense_date, category_id, category, amount, store, is_recurring,
        note, created_by, source_log_id
      ) values (
        (new.created_at at time zone 'Asia/Seoul')::date, v_category_id,
        '고객 교환 원가차액', v_difference, 'common', false,
        coalesce(nullif(btrim(v_customer.name), ''), '고객 미지정') || ',' ||
        coalesce(nullif(btrim(v_customer.phone), ''), '번호 없음') ||
        ' 교환출고 ' || coalesce(nullif(v_out_summary, ''), '없음') ||
        ' / 교환입고 ' || coalesce(nullif(v_in_summary, ''), '없음'),
        new.admin_id, new.id
      ) on conflict(source_log_id) where source_log_id is not null and category = '고객 교환 원가차액'
      do update set amount = excluded.amount, note = excluded.note, updated_at = now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_process_customer_exchange_cost_ledger_trigger on public.logs;
create trigger zz_process_customer_exchange_cost_ledger_trigger
after insert on public.logs
for each row execute function public.process_customer_exchange_cost_ledger();

revoke all on function public.process_customer_exchange_cost_ledger()
from public, anon, authenticated;
