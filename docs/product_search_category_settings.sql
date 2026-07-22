-- 상품 검색에서 관리자가 액상으로 분류할 품목 종류를 지정합니다.
create table if not exists public.product_search_category_settings (
  search_group text not null check (search_group in ('liquid')),
  category_id bigint not null references public.item_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (search_group, category_id)
);

-- 기존 코드에 지정되어 있던 6개 종류를 최초 기본값으로 등록합니다.
insert into public.product_search_category_settings (search_group, category_id)
select 'liquid', id
from public.item_categories
where name in (
  '입호흡액상 기본',
  '입호흡액상 예약',
  '입호흡액상 이벤트',
  '폐호흡액상 기본',
  '폐호흡액상 이벤트',
  '폐호흡액상 예약'
)
on conflict do nothing;

alter table public.product_search_category_settings enable row level security;

drop policy if exists "authenticated users can read product search category settings" on public.product_search_category_settings;
create policy "authenticated users can read product search category settings"
  on public.product_search_category_settings for select
  to authenticated using (true);

drop policy if exists "admins can manage product search category settings" on public.product_search_category_settings;
create policy "admins can manage product search category settings"
  on public.product_search_category_settings for all
  to authenticated
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.oss_role = 'admin'
    )
  );
