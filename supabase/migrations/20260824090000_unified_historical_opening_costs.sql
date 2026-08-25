create or replace function public.save_settlement_unified_item_costs_bulk(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  segment jsonb;
  sold_quantity integer;
  opening_quantity integer;
  segment_quantity integer;
  historical_quantity integer;
  opening_segment_quantity integer;
  remaining_sold integer;
  entered_total integer;
  historical_order integer;
  opening_order integer;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('master', 'admin')) then
    raise exception '정산 원가 관리 권한이 없습니다.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '저장할 통합 원가가 없습니다.';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    sold_quantity := coalesce((item->>'sold_quantity')::integer, 0);
    opening_quantity := coalesce((item->>'opening_quantity')::integer, 0);
    if coalesce(btrim(item->>'item_name'), '') = '' or sold_quantity < 0 or opening_quantity < 0
      or sold_quantity + opening_quantity <= 0 or jsonb_typeof(item->'segments') <> 'array'
      or jsonb_array_length(item->'segments') = 0 then
      raise exception '잘못된 통합 원가 정보입니다.';
    end if;

    entered_total := 0;
    for segment in select value from jsonb_array_elements(item->'segments')
    loop
      segment_quantity := coalesce((segment->>'quantity')::integer, 0);
      if segment_quantity <= 0 or coalesce((segment->>'unit_cost')::integer, -1) < 0 then
        raise exception '수량과 원가를 확인해 주세요.';
      end if;
      entered_total := entered_total + segment_quantity;
    end loop;
    if entered_total <> sold_quantity + opening_quantity then
      raise exception '통합 원가 수량 합계가 맞지 않습니다: %', item->>'item_name';
    end if;

    delete from public.settlement_item_cost_bases
    where item_name = item->>'item_name'
      and basis_type in ('historical', 'opening_20260722');

    remaining_sold := sold_quantity;
    historical_order := 0;
    opening_order := 0;
    for segment in select value from jsonb_array_elements(item->'segments')
    loop
      segment_quantity := (segment->>'quantity')::integer;
      historical_quantity := least(segment_quantity, remaining_sold);
      opening_segment_quantity := segment_quantity - historical_quantity;

      if historical_quantity > 0 then
        insert into public.settlement_item_cost_bases (
          item_id, item_name, basis_type, quantity, unit_cost, sort_order, created_by
        ) values (
          nullif(item->>'item_id', '')::bigint, item->>'item_name', 'historical',
          historical_quantity, (segment->>'unit_cost')::integer, historical_order, auth.uid()
        );
        historical_order := historical_order + 1;
        remaining_sold := remaining_sold - historical_quantity;
      end if;

      if opening_segment_quantity > 0 then
        insert into public.settlement_item_cost_bases (
          item_id, item_name, basis_type, quantity, unit_cost, sort_order, created_by
        ) values (
          nullif(item->>'item_id', '')::bigint, item->>'item_name', 'opening_20260722',
          opening_segment_quantity, (segment->>'unit_cost')::integer, opening_order, auth.uid()
        );
        opening_order := opening_order + 1;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.save_settlement_unified_item_costs_bulk(jsonb) from public, anon;
grant execute on function public.save_settlement_unified_item_costs_bulk(jsonb) to authenticated;
