-- 매뉴얼 관련 테이블 공개 접근 차단 및 관리자 쓰기 권한 설정
-- 기존 데이터는 삭제하거나 변경하지 않습니다.

alter table public.manual_top_categories enable row level security;
alter table public.manual_sub_categories enable row level security;
alter table public.manuals enable row level security;

-- 기존에 만들어진 느슨한 정책까지 제거한 뒤 필요한 정책만 다시 생성합니다.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('manual_top_categories', 'manual_sub_categories', 'manuals')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

-- anon 키로는 테이블에 직접 접근할 수 없습니다.
revoke all on table public.manual_top_categories from anon;
revoke all on table public.manual_sub_categories from anon;
revoke all on table public.manuals from anon;

-- 로그인한 사용자는 매뉴얼과 분류를 조회할 수 있습니다.
grant select on table public.manual_top_categories to authenticated;
grant select on table public.manual_sub_categories to authenticated;
grant select on table public.manuals to authenticated;

create policy "authenticated users can read manual top categories"
  on public.manual_top_categories for select
  to authenticated using (true);

create policy "authenticated users can read manual sub categories"
  on public.manual_sub_categories for select
  to authenticated using (true);

create policy "authenticated users can read manuals"
  on public.manuals for select
  to authenticated using (true);

-- 쓰기 권한은 앱의 관리자 계정으로 제한합니다.
grant insert, update, delete on table public.manual_top_categories to authenticated;
grant insert, update, delete on table public.manual_sub_categories to authenticated;
grant insert, update, delete on table public.manuals to authenticated;

create policy "admins can manage manual top categories"
  on public.manual_top_categories for all
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

create policy "admins can manage manual sub categories"
  on public.manual_sub_categories for all
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

create policy "admins can manage manuals"
  on public.manuals for all
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
