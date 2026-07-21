-- Supabase SQL Editor에서 한 번 실행하세요.
create table if not exists public.navigation_menu_settings (
  href text primary key check (href like '/%'),
  label text not null check (length(trim(label)) > 0),
  group_key text not null check (group_key in ('customer', 'product', 'store')),
  sort_order integer not null default 0 check (sort_order >= 0),
  updated_at timestamptz not null default now()
);

insert into public.navigation_menu_settings (href, label, group_key, sort_order)
values
  ('/customers', '고객', 'customer', 0),
  ('/histories', '이력', 'customer', 1),
  ('/after-services', 'AS 현황', 'customer', 2),
  ('/product-search', '상품 검색', 'product', 0),
  ('/items', '품목 관리', 'product', 1),
  ('/comparison', '기기 비교', 'product', 2),
  ('/liqud-stand', '시연대', 'product', 3),
  ('/cash-management', '시재', 'store', 0),
  ('/work-journal', '근무일지', 'store', 1),
  ('/manuals', '매뉴얼', 'store', 2)
on conflict (href) do nothing;

alter table public.navigation_menu_settings enable row level security;

drop policy if exists "authenticated users can read navigation menu" on public.navigation_menu_settings;
create policy "authenticated users can read navigation menu"
  on public.navigation_menu_settings for select
  to authenticated using (true);

drop policy if exists "admins can manage navigation menu" on public.navigation_menu_settings;
create policy "admins can manage navigation menu"
  on public.navigation_menu_settings for all
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
