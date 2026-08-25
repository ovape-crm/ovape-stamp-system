create or replace function public.save_settlement_item_costs_bulk(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  segment jsonb;
  segment_index integer;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('master', 'admin')) then
    raise exception '정산 원가 관리 권한이 없습니다.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '저장할 품목 원가가 없습니다.';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(btrim(item->>'item_name'), '') = '' or jsonb_typeof(item->'segments') <> 'array' or jsonb_array_length(item->'segments') = 0 then
      raise exception '잘못된 품목 원가 정보입니다.';
    end if;
    for segment in select value from jsonb_array_elements(item->'segments')
    loop
      if coalesce((segment->>'quantity')::integer, 0) <= 0 or coalesce((segment->>'unit_cost')::integer, -1) < 0 then
        raise exception '수량과 원가를 확인해 주세요.';
      end if;
    end loop;

    delete from public.settlement_item_cost_bases
    where item_name = item->>'item_name' and basis_type = 'historical';

    segment_index := 0;
    for segment in select value from jsonb_array_elements(item->'segments')
    loop
      insert into public.settlement_item_cost_bases (
        item_id, item_name, basis_type, quantity, unit_cost, sort_order, created_by
      ) values (
        nullif(item->>'item_id', '')::bigint,
        item->>'item_name',
        'historical',
        (segment->>'quantity')::integer,
        (segment->>'unit_cost')::integer,
        segment_index,
        auth.uid()
      );
      segment_index := segment_index + 1;
    end loop;
  end loop;
end;
$$;

revoke all on function public.save_settlement_item_costs_bulk(jsonb) from public, anon;
grant execute on function public.save_settlement_item_costs_bulk(jsonb) to authenticated;
