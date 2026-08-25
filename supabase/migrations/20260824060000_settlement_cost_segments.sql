alter table public.settlement_item_cost_bases
  add column if not exists quantity integer,
  add column if not exists sort_order integer not null default 0;

update public.settlement_item_cost_bases set quantity = 1 where quantity is null;

alter table public.settlement_item_cost_bases
  alter column quantity set not null,
  drop constraint if exists settlement_item_cost_bases_item_name_basis_type_key,
  drop constraint if exists settlement_item_cost_bases_quantity_check,
  add constraint settlement_item_cost_bases_quantity_check check (quantity > 0),
  drop constraint if exists settlement_item_cost_bases_sort_order_check,
  add constraint settlement_item_cost_bases_sort_order_check check (sort_order >= 0);

drop index if exists public.settlement_item_cost_bases_item_name_basis_type_idx;
create unique index if not exists settlement_item_cost_bases_item_name_basis_type_order_idx
  on public.settlement_item_cost_bases (item_name, basis_type, sort_order);

create or replace function public.save_settlement_item_cost_segments(
  p_item_id bigint,
  p_item_name text,
  p_basis_type text,
  p_segments jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  segment jsonb;
  segment_index integer := 0;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('master', 'admin')) then
    raise exception '정산 원가 관리 권한이 없습니다.';
  end if;
  if p_basis_type not in ('historical', 'opening_20260722') or coalesce(trim(p_item_name), '') = '' then
    raise exception '잘못된 품목 원가 정보입니다.';
  end if;
  if jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) = 0 then
    raise exception '원가 구간이 필요합니다.';
  end if;
  for segment in select value from jsonb_array_elements(p_segments)
  loop
    if coalesce((segment->>'quantity')::integer, 0) <= 0 or coalesce((segment->>'unit_cost')::integer, -1) < 0 then
      raise exception '수량과 원가를 확인해 주세요.';
    end if;
  end loop;

  delete from public.settlement_item_cost_bases where item_name = p_item_name and basis_type = p_basis_type;
  for segment in select value from jsonb_array_elements(p_segments)
  loop
    insert into public.settlement_item_cost_bases (item_id, item_name, basis_type, quantity, unit_cost, sort_order, created_by)
    values (p_item_id, p_item_name, p_basis_type, (segment->>'quantity')::integer, (segment->>'unit_cost')::integer, segment_index, auth.uid());
    segment_index := segment_index + 1;
  end loop;
end;
$$;

revoke all on function public.save_settlement_item_cost_segments(bigint, text, text, jsonb) from public, anon;
grant execute on function public.save_settlement_item_cost_segments(bigint, text, text, jsonb) to authenticated;

drop policy if exists "master manages settlement item costs" on public.settlement_item_cost_bases;
create policy "master manages settlement item costs"
on public.settlement_item_cost_bases for all to authenticated
using (exists (select 1 from public.users where id = auth.uid() and oss_role in ('master', 'admin')))
with check (created_by = auth.uid() and exists (select 1 from public.users where id = auth.uid() and oss_role in ('master', 'admin')));
