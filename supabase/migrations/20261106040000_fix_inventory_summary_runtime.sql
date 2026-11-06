create or replace function public.get_inventory_movement_summary(
  p_start_date date, p_end_date date, p_movement_group text default null,
  p_search text default null, p_sort_key text default 'code',
  p_sort_direction text default 'asc', p_limit integer default 20, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_start_at timestamptz := (p_start_date::timestamp at time zone 'Asia/Seoul');
  v_end_at timestamptz := ((p_end_date + 1)::timestamp at time zone 'Asia/Seoul');
  v_sort_key text := case when p_sort_key in ('code', 'name') then p_sort_key else 'code' end;
  v_sort_direction text := case when lower(p_sort_direction) = 'desc' then 'desc' else 'asc' end;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('staff', 'admin', 'master')) then
    raise exception 'INVENTORY_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_movement_group is not null and p_movement_group not in ('in', 'out') then raise exception 'INVALID_MOVEMENT_GROUP'; end if;
  return (
    with base as (
      select movement.item_name,
        case when movement.quantity_delta >= 0 then 'in' else 'out' end as direction,
        (movement.created_at at time zone 'Asia/Seoul')::date as movement_date,
        movement.quantity_delta
      from public.inventory_movements movement
      where movement.created_at >= v_start_at and movement.created_at < v_end_at
        and coalesce(movement.reference_type, '') <> 'historical_sheet_import_repair'
        and (p_movement_group is null or (p_movement_group = 'in' and movement.quantity_delta > 0) or (p_movement_group = 'out' and movement.quantity_delta < 0))
    ), daily as (
      select item_name, direction, movement_date, sum(quantity_delta)::integer as daily_quantity
      from base group by item_name, direction, movement_date
    ), grouped as (
      select item_name, direction, sum(daily_quantity)::integer as total_quantity,
        jsonb_object_agg(to_char(movement_date, 'YYYY-MM-DD'), daily_quantity) as quantities
      from daily group by item_name, direction
    ), coded as (
      select grouped.*, coalesce((select item.item_code from public.items item where btrim(item.item_name) = btrim(grouped.item_name) order by item.id limit 1), '') as item_code
      from grouped
    ), filtered as (
      select * from coded where nullif(btrim(p_search), '') is null
        or item_name ilike '%' || btrim(p_search) || '%' or item_code ilike '%' || btrim(p_search) || '%'
    ), ordered as (
      select *, row_number() over (order by
        case when v_sort_key = 'code' and v_sort_direction = 'asc' then nullif(item_code, '') end asc nulls last,
        case when v_sort_key = 'code' and v_sort_direction = 'desc' then nullif(item_code, '') end desc nulls last,
        case when v_sort_key = 'name' and v_sort_direction = 'asc' then item_name end asc,
        case when v_sort_key = 'name' and v_sort_direction = 'desc' then item_name end desc,
        item_name asc, direction asc) as sort_position from filtered
    ), paged as (
      select * from ordered order by sort_position offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
    ) select jsonb_build_object('total', (select count(*) from filtered), 'rows', coalesce(jsonb_agg(jsonb_build_object(
      'itemName', item_name, 'itemCode', item_code, 'direction', direction,
      'totalQuantity', total_quantity, 'quantities', quantities) order by sort_position), '[]'::jsonb)) from paged
  );
end;
$$;

revoke all on function public.get_inventory_movement_summary(date, date, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.get_inventory_movement_summary(date, date, text, text, text, text, integer, integer) to authenticated;
notify pgrst, 'reload schema';
