alter table public.inventory_movements
  add column if not exists counterparty_name text,
  add column if not exists counterparty_id text,
  add column if not exists inventory_action text,
  add column if not exists item_remark text;

update public.inventory_movements movement
set
  counterparty_name = customer.name,
  counterparty_id = outbound.customer_id::text,
  inventory_action = item.value->>'inventoryAction',
  item_remark = item.value->>'remark'
from public.logs outbound
left join public.customers customer
  on customer.id::text = outbound.customer_id::text
left join lateral jsonb_array_elements(coalesce(outbound.jsonb->'items', '[]'::jsonb)) item(value)
  on true
where movement.reference_type = 'outbound_log'
  and movement.reference_id = outbound.id::text
  and btrim(item.value->>'itemName') = movement.item_name;

create or replace function public.sync_outbound_log_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_log_id text := coalesce(new.id, old.id)::text;
  old_effects jsonb := '{}'::jsonb;
  new_effects jsonb := '{}'::jsonb;
  source_items jsonb :=
    coalesce(new.jsonb->'items', '[]'::jsonb) ||
    coalesce(old.jsonb->'items', '[]'::jsonb);
  has_managed_state boolean := false;
  effect_entry record;
  source_item jsonb;
  change_quantity integer;
  next_quantity integer;
  movement_kind text;
  actor_id uuid := coalesce(new.admin_id, old.admin_id);
  snapshot_customer_id text := coalesce(new.customer_id, old.customer_id)::text;
  snapshot_customer_name text;
begin
  if snapshot_customer_id is not null then
    select customer.name into snapshot_customer_name
    from public.customers customer
    where customer.id::text = snapshot_customer_id;
  end if;

  select effects into old_effects
  from public.inventory_outbound_log_states
  where log_id = target_log_id
  for update;
  has_managed_state := found;
  old_effects := coalesce(old_effects, '{}'::jsonb);

  if tg_op = 'DELETE' and not has_managed_state then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and not has_managed_state
     and not (old.category = 'reservation' and new.category = 'stamp') then
    return new;
  end if;

  if tg_op <> 'DELETE' and new.category = 'stamp' then
    new_effects := public.outbound_inventory_effects(new.jsonb->'items');
  end if;

  movement_kind := case
    when tg_op = 'DELETE' then 'outbound_cancel'
    when old_effects = '{}'::jsonb then 'sale_out'
    else 'outbound_edit'
  end;

  for effect_entry in
    select key as item_name
    from (
      select key from jsonb_each(old_effects)
      union
      select key from jsonb_each(new_effects)
    ) names
  loop
    change_quantity :=
      coalesce((new_effects->>effect_entry.item_name)::integer, 0) -
      coalesce((old_effects->>effect_entry.item_name)::integer, 0);

    if change_quantity = 0 or not public.is_inventory_item_tracked(effect_entry.item_name) then
      continue;
    end if;

    select item.value into source_item
    from jsonb_array_elements(source_items) item(value)
    where btrim(item.value->>'itemName') = effect_entry.item_name
    limit 1;

    insert into public.inventory_balances (item_name, quantity, updated_at)
    values (effect_entry.item_name, change_quantity, now())
    on conflict (item_name) do update
      set quantity = public.inventory_balances.quantity + excluded.quantity,
          updated_at = now()
    returning quantity into next_quantity;

    insert into public.inventory_movements (
      item_name, movement_type, quantity_delta, quantity_after,
      reference_type, reference_id, note, created_by,
      counterparty_name, counterparty_id, inventory_action, item_remark
    ) values (
      effect_entry.item_name,
      case
        when movement_kind = 'sale_out' and change_quantity > 0 then 'exchange_in'
        else movement_kind
      end,
      change_quantity,
      next_quantity,
      'outbound_log',
      target_log_id,
      case movement_kind
        when 'sale_out' then '출고 처리'
        when 'outbound_edit' then '출고 수정'
        else '출고 취소'
      end,
      actor_id,
      snapshot_customer_name,
      snapshot_customer_id,
      source_item->>'inventoryAction',
      source_item->>'remark'
    );
  end loop;

  if tg_op = 'DELETE' then
    delete from public.inventory_outbound_log_states where log_id = target_log_id;
    return old;
  end if;

  insert into public.inventory_outbound_log_states (log_id, effects, updated_at)
  values (target_log_id, new_effects, now())
  on conflict (log_id) do update
    set effects = excluded.effects, updated_at = now();
  return new;
end;
$$;
