-- 재고 원장은 기존 품목명을 보존하고 있다. 품목명이 바뀔 때 그 원장을 현재
-- 품목 ID에 자동 귀속시켜, 재고 개요가 최신 품목명·코드로 표시되게 한다.
-- 같은 과거 이름이 다른 품목에 이미 연결된 경우에는 기존 귀속을 절대 덮어쓰지
-- 않는다. 이름 재사용으로 과거 재고가 다른 품목으로 이동하는 것을 막기 위함이다.
--
-- 이미 변경된 품목명도 출고·원가 이력에 남은 itemId를 이용해 복구한다. 하나의
-- 과거 이름에서 단 하나의 현재 품목 ID만 확인되는 경우만 자동 연결하며, 여러
-- 품목 ID가 발견되는 이름은 잘못된 합산을 막기 위해 연결하지 않는다.
with item_candidates as (
  select
    normalize(btrim(cost_event.item_name), NFC) as legacy_item_name,
    cost_event.item_id
  from public.inventory_cost_events cost_event
  join public.items item on item.id = cost_event.item_id
  where cost_event.item_id is not null
    and btrim(cost_event.item_name) <> ''

  union

  select
    normalize(btrim(line.item ->> 'itemName'), NFC) as legacy_item_name,
    (line.item ->> 'itemId')::bigint as item_id
  from public.logs log
  cross join lateral jsonb_array_elements(
    coalesce(log.jsonb -> 'items', '[]'::jsonb)
  ) as line(item)
  join public.items item on item.id = (line.item ->> 'itemId')::bigint
  where line.item ->> 'itemId' ~ '^[0-9]+$'
    and btrim(coalesce(line.item ->> 'itemName', '')) <> ''
), unambiguous_links as (
  select legacy_item_name, min(item_id) as item_id
  from item_candidates
  group by legacy_item_name
  having count(distinct item_id) = 1
), migration_actor as (
  select coalesce(
    auth.uid(),
    (select id from public.users where oss_role = 'master' order by created_at limit 1)
  ) as id
)
insert into public.inventory_renewal_item_links (
  legacy_item_name,
  item_id,
  updated_by
)
select
  links.legacy_item_name,
  links.item_id,
  actor.id
from unambiguous_links links
cross join migration_actor actor
where actor.id is not null
on conflict (legacy_item_name) do nothing;

create or replace function public.link_renamed_inventory_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.item_name is not distinct from old.item_name then
    return new;
  end if;

  insert into public.inventory_renewal_item_links (
    legacy_item_name,
    item_id,
    updated_by
  ) values (
    normalize(btrim(old.item_name), NFC),
    new.id,
    auth.uid()
  )
  on conflict (legacy_item_name) do update
    set updated_at = now(),
        updated_by = excluded.updated_by
    -- 이미 다른 품목에 귀속된 과거 이름은 재사용된 이름일 수 있으므로
    -- 새 품목으로 덮어쓰지 않는다.
    where public.inventory_renewal_item_links.item_id = excluded.item_id;

  return new;
end;
$$;

drop trigger if exists link_renamed_inventory_item on public.items;
create trigger link_renamed_inventory_item
after update of item_name on public.items
for each row
when (old.item_name is distinct from new.item_name)
execute function public.link_renamed_inventory_item();
