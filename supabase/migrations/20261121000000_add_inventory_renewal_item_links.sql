-- 리뉴얼 재고 화면에서만 사용하는 기존 재고명과 현재 품목의 연결표다.
-- 기존 재고 잔액·변동·원가 원장은 수정하지 않는다.
create table if not exists public.inventory_renewal_item_links (
  legacy_item_name text primary key check (legacy_item_name = btrim(legacy_item_name) and length(legacy_item_name) > 0),
  item_id bigint not null references public.items(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);

alter table public.inventory_renewal_item_links enable row level security;
revoke all on public.inventory_renewal_item_links from public, anon;
grant select on public.inventory_renewal_item_links to authenticated;
grant insert, update, delete on public.inventory_renewal_item_links to authenticated;

create policy "authenticated reads inventory renewal item links"
  on public.inventory_renewal_item_links for select to authenticated
  using (true);

create policy "master manages inventory renewal item links"
  on public.inventory_renewal_item_links for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'))
  with check (updated_by = auth.uid() and exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'));
