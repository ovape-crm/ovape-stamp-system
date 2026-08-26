create table if not exists public.inventory_cost_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'opening', 'purchase_in', 'sale_out',
    'customer_exchange_in', 'customer_exchange_out',
    'after_service_out', 'after_service_in',
    'adjustment_in', 'adjustment_out', 'demo_out', 'loss_out', 'reversal'
  )),
  event_at timestamptz not null,
  item_id bigint references public.items(id) on delete set null,
  item_name text not null check (length(btrim(item_name)) > 0),
  direction text not null check (direction in ('in', 'out')),
  quantity integer not null check (quantity > 0),
  total_cost integer,
  reference_type text not null,
  reference_id text not null,
  reference_line_key text not null default '',
  settlement_effect text not null default 'none' check (settlement_effect in (
    'none', 'sale_cogs', 'customer_exchange_difference',
    'after_service_pending', 'inventory_loss', 'demo_expense'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(reference_type, reference_id, reference_line_key, event_type)
);

create index if not exists inventory_cost_events_item_date_idx
  on public.inventory_cost_events(item_name, event_at, created_at);
create index if not exists inventory_cost_events_reference_idx
  on public.inventory_cost_events(reference_type, reference_id);

create table if not exists public.inventory_cost_layers (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null unique
    references public.inventory_cost_events(id) on delete cascade,
  item_id bigint references public.items(id) on delete set null,
  item_name text not null check (length(btrim(item_name)) > 0),
  original_quantity integer not null check (original_quantity > 0),
  remaining_quantity integer not null check (
    remaining_quantity >= 0 and remaining_quantity <= original_quantity
  ),
  unit_cost integer,
  queue_sequence numeric(30, 6) not null,
  cost_status text not null default 'confirmed' check (
    cost_status in ('confirmed', 'pending')
  ),
  source_layer_id uuid references public.inventory_cost_layers(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (cost_status = 'pending' and unit_cost is null)
    or (cost_status = 'confirmed' and unit_cost is not null and unit_cost >= 0)
  )
);

create index if not exists inventory_cost_layers_fifo_idx
  on public.inventory_cost_layers(item_name, queue_sequence, created_at)
  where remaining_quantity > 0;

create table if not exists public.inventory_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  outbound_event_id uuid not null
    references public.inventory_cost_events(id) on delete cascade,
  source_layer_id uuid not null
    references public.inventory_cost_layers(id),
  quantity integer not null check (quantity > 0),
  unit_cost integer,
  created_at timestamptz not null default now(),
  unique(outbound_event_id, source_layer_id),
  check (unit_cost is null or unit_cost >= 0)
);

create index if not exists inventory_cost_allocations_source_idx
  on public.inventory_cost_allocations(source_layer_id);

alter table public.inventory_cost_events enable row level security;
alter table public.inventory_cost_layers enable row level security;
alter table public.inventory_cost_allocations enable row level security;

revoke all on public.inventory_cost_events from public, anon, authenticated;
revoke all on public.inventory_cost_layers from public, anon, authenticated;
revoke all on public.inventory_cost_allocations from public, anon, authenticated;
grant select on public.inventory_cost_events to authenticated;
grant select on public.inventory_cost_layers to authenticated;
grant select on public.inventory_cost_allocations to authenticated;

create policy "master reads inventory cost events"
on public.inventory_cost_events for select to authenticated
using (exists (
  select 1 from public.users where id = auth.uid() and oss_role = 'master'
));
create policy "master reads inventory cost layers"
on public.inventory_cost_layers for select to authenticated
using (exists (
  select 1 from public.users where id = auth.uid() and oss_role = 'master'
));
create policy "master reads inventory cost allocations"
on public.inventory_cost_allocations for select to authenticated
using (exists (
  select 1 from public.users where id = auth.uid() and oss_role = 'master'
));

create or replace function public.create_inventory_cost_layer(
  p_event_type text,
  p_event_at timestamptz,
  p_item_id bigint,
  p_item_name text,
  p_quantity integer,
  p_unit_cost integer,
  p_cost_status text,
  p_queue_position text,
  p_reference_type text,
  p_reference_id text,
  p_reference_line_key text default '',
  p_source_layer_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_sequence numeric(30, 6);
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if p_queue_position not in ('front', 'back') then raise exception 'INVALID_QUEUE_POSITION'; end if;
  if p_cost_status not in ('confirmed', 'pending') then raise exception 'INVALID_COST_STATUS'; end if;
  if (p_cost_status = 'confirmed' and (p_unit_cost is null or p_unit_cost < 0))
    or (p_cost_status = 'pending' and p_unit_cost is not null)
  then raise exception 'INVALID_UNIT_COST'; end if;

  perform pg_advisory_xact_lock(hashtextextended(btrim(p_item_name), 0));
  if p_queue_position = 'front' then
    select coalesce(min(queue_sequence) - 1, 0) into v_sequence
    from public.inventory_cost_layers where item_name = btrim(p_item_name);
  else
    select coalesce(max(queue_sequence) + 1, 0) into v_sequence
    from public.inventory_cost_layers where item_name = btrim(p_item_name);
  end if;

  insert into public.inventory_cost_events(
    event_type, event_at, item_id, item_name, direction, quantity,
    total_cost, reference_type, reference_id, reference_line_key,
    metadata, created_by
  ) values (
    p_event_type, p_event_at, p_item_id, btrim(p_item_name), 'in', p_quantity,
    case when p_unit_cost is null then null else p_unit_cost * p_quantity end,
    p_reference_type, p_reference_id, coalesce(p_reference_line_key, ''),
    coalesce(p_metadata, '{}'::jsonb), auth.uid()
  )
  on conflict(reference_type, reference_id, reference_line_key, event_type)
  do update set metadata = excluded.metadata
  returning id into v_event_id;

  insert into public.inventory_cost_layers(
    source_event_id, item_id, item_name, original_quantity,
    remaining_quantity, unit_cost, queue_sequence, cost_status, source_layer_id
  ) values (
    v_event_id, p_item_id, btrim(p_item_name), p_quantity,
    p_quantity, p_unit_cost, v_sequence, p_cost_status, p_source_layer_id
  ) on conflict(source_event_id) do nothing;

  return v_event_id;
end;
$$;

create or replace function public.allocate_inventory_cost_fifo(
  p_event_type text,
  p_event_at timestamptz,
  p_item_id bigint,
  p_item_name text,
  p_quantity integer,
  p_reference_type text,
  p_reference_id text,
  p_reference_line_key text default '',
  p_settlement_effect text default 'none',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_layer public.inventory_cost_layers%rowtype;
  v_remaining integer := p_quantity;
  v_consumed integer;
  v_total_cost integer := 0;
  v_has_pending boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_item_name), 0));

  insert into public.inventory_cost_events(
    event_type, event_at, item_id, item_name, direction, quantity,
    reference_type, reference_id, reference_line_key,
    settlement_effect, metadata, created_by
  ) values (
    p_event_type, p_event_at, p_item_id, btrim(p_item_name), 'out', p_quantity,
    p_reference_type, p_reference_id, coalesce(p_reference_line_key, ''),
    p_settlement_effect, coalesce(p_metadata, '{}'::jsonb), auth.uid()
  )
  on conflict(reference_type, reference_id, reference_line_key, event_type)
  do update set metadata = excluded.metadata
  returning id into v_event_id;

  if exists (select 1 from public.inventory_cost_allocations where outbound_event_id = v_event_id) then
    return v_event_id;
  end if;

  for v_layer in
    select * from public.inventory_cost_layers
    where item_name = btrim(p_item_name) and remaining_quantity > 0
    order by queue_sequence, created_at, id
    for update
  loop
    exit when v_remaining = 0;
    v_consumed := least(v_remaining, v_layer.remaining_quantity);
    insert into public.inventory_cost_allocations(
      outbound_event_id, source_layer_id, quantity, unit_cost
    ) values (v_event_id, v_layer.id, v_consumed, v_layer.unit_cost);
    update public.inventory_cost_layers
    set remaining_quantity = remaining_quantity - v_consumed
    where id = v_layer.id;
    if v_layer.unit_cost is null then
      v_has_pending := true;
    else
      v_total_cost := v_total_cost + v_consumed * v_layer.unit_cost;
    end if;
    v_remaining := v_remaining - v_consumed;
  end loop;

  if v_remaining > 0 then
    raise exception 'COST_LAYER_QUANTITY_MISSING:%', v_remaining;
  end if;

  update public.inventory_cost_events
  set total_cost = case when v_has_pending then null else v_total_cost end
  where id = v_event_id;
  return v_event_id;
end;
$$;

revoke all on function public.create_inventory_cost_layer(
  text, timestamptz, bigint, text, integer, integer, text, text,
  text, text, text, uuid, jsonb
) from public, anon, authenticated;
revoke all on function public.allocate_inventory_cost_fifo(
  text, timestamptz, bigint, text, integer, text, text, text, text, jsonb
) from public, anon, authenticated;

-- These are internal building blocks. Staff-facing processing RPCs call them
-- from security-definer functions without exposing raw unit-cost writes.
