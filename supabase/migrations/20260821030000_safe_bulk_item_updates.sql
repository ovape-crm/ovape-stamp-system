create or replace function public.save_items_bulk(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  target_id text;
  target_category_id public.item_categories.id%type;
  changed_count integer := 0;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 2000 then
    raise exception 'INVALID_ITEM_UPDATE_COUNT';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) value
    group by btrim(value->>'id')
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_ITEM_ID';
  end if;

  for entry in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    target_id := nullif(btrim(entry->>'id'), '');
    if target_id is null or nullif(btrim(entry->>'item_name'), '') is null
       or nullif(btrim(entry->>'item_code'), '') is null then
      raise exception 'INVALID_ITEM_DATA';
    end if;

    target_category_id := null;
    if nullif(entry->>'category_id', '') is not null then
      select id into target_category_id
      from public.item_categories
      where id::text = entry->>'category_id';
      if not found then raise exception 'ITEM_CATEGORY_NOT_FOUND'; end if;
    end if;

    update public.items
    set category_id = target_category_id,
        item_code = btrim(entry->>'item_code'),
        item_name = normalize(btrim(entry->>'item_name'), NFC),
        selling_price = nullif(entry->>'selling_price', '')::integer,
        liquid_type = nullif(btrim(coalesce(entry->>'liquid_type', '')), ''),
        liquid_flavor = nullif(btrim(coalesce(entry->>'liquid_flavor', '')), ''),
        note = nullif(btrim(coalesce(entry->>'note', '')), ''),
        is_use = coalesce((entry->>'is_use')::boolean, true),
        updated_at = now()
    where id::text = target_id;

    if not found then raise exception 'ITEM_NOT_FOUND: %', target_id; end if;
    changed_count := changed_count + 1;
  end loop;

  return changed_count;
end;
$$;

revoke all on function public.save_items_bulk(jsonb) from public, anon;
grant execute on function public.save_items_bulk(jsonb) to authenticated;
