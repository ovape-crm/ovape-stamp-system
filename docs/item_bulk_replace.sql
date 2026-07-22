-- 품목 일괄 교체. 실제 삭제 대신 CSV에서 빠진 품목을 미사용 처리합니다.
-- 재고는 item_name으로 별도 보존되므로 동일한 이름이 다시 들어오면 자동으로 연결됩니다.
-- 품목코드는 표시용이므로 중복을 허용하고, 재고 연결 기준인 품목명만 고유하게 유지합니다.
alter table public.items drop constraint if exists items_item_code_key;
drop index if exists public.items_item_code_key;

-- 이전 함수/API 캐시와 완전히 분리된 v2 함수를 사용합니다.
drop function if exists public.replace_items_by_name_v2(jsonb);

create function public.replace_items_by_name_v2(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_name text;
  v_code text;
  v_category text;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_deactivated integer := 0;
  v_affected integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.users where id = auth.uid() and oss_role = 'admin'
  ) then
    raise exception '관리자만 품목을 일괄 교체할 수 있습니다.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '교체할 품목이 없습니다.';
  end if;

  -- 동시에 두 번 실행되어 코드/이름이 꼬이는 것을 막습니다.
  lock table public.items in share row exclusive mode;
  create temporary table bulk_items_input_v2 (
    item_name text primary key,
    item_code text not null,
    payload jsonb not null
  ) on commit drop;

  for v_row in select value from jsonb_array_elements(p_items)
  loop
    v_name := btrim(v_row->>'item_name');
    v_code := btrim(v_row->>'item_code');
    v_category := btrim(coalesce(v_row->>'category_name', ''));
    if v_name = '' or v_code = '' then raise exception '품목명과 품목 코드는 필수입니다.'; end if;
    insert into bulk_items_input_v2 values (v_name, v_code, v_row);
    if v_category <> '' and not exists (select 1 from public.item_categories where name = v_category) then
      raise exception '존재하지 않는 품목 종류입니다: %', v_category;
    end if;

  end loop;

  for v_row in select payload from bulk_items_input_v2
  loop
    v_name := btrim(v_row->>'item_name');
    v_code := btrim(v_row->>'item_code');
    v_category := btrim(coalesce(v_row->>'category_name', ''));
    update public.items
    set item_code = v_code,
        category_id = (select id from public.item_categories where name = v_category limit 1),
        purchase_price = nullif(v_row->>'purchase_price', '')::integer,
        selling_price = nullif(v_row->>'selling_price', '')::integer,
        liquid_type = nullif(btrim(coalesce(v_row->>'liquid_type', '')), ''),
        liquid_flavor = nullif(btrim(coalesce(v_row->>'liquid_flavor', '')), ''),
        note = nullif(btrim(coalesce(v_row->>'note', '')), ''),
        is_use = true,
        updated_at = now()
    where item_name = v_name;
    get diagnostics v_affected = row_count;
    if v_affected > 1 then raise exception 'DB에 중복된 품목명이 있습니다: %', v_name; end if;
    if v_affected = 1 then
      v_updated := v_updated + 1;
    else
      insert into public.items(category_id, item_code, item_name, purchase_price, selling_price, liquid_type, liquid_flavor, note, is_use)
      values ((select id from public.item_categories where name = v_category limit 1), v_code, v_name,
        nullif(v_row->>'purchase_price', '')::integer, nullif(v_row->>'selling_price', '')::integer,
        nullif(btrim(coalesce(v_row->>'liquid_type', '')), ''), nullif(btrim(coalesce(v_row->>'liquid_flavor', '')), ''),
        nullif(btrim(coalesce(v_row->>'note', '')), ''), true);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  select count(*) into v_deactivated
  from public.items current_item
  where current_item.is_use = true
    and not exists (select 1 from bulk_items_input_v2 input where input.item_name = current_item.item_name);

  update public.items current_item
  set is_use = false,
      updated_at = now()
  where not exists (select 1 from bulk_items_input_v2 input where input.item_name = current_item.item_name);
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'deactivated', v_deactivated);
end;
$$;

revoke all on function public.replace_items_by_name_v2(jsonb) from public, anon;
grant execute on function public.replace_items_by_name_v2(jsonb) to authenticated;
notify pgrst, 'reload schema';
