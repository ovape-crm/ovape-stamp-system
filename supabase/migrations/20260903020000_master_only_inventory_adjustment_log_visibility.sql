-- 재고조정 출고·입고 이력은 마스터에게만 조회를 허용한다.
-- Restrictive 정책으로 기존 일반 로그 조회 정책과 함께 항상 적용된다.
alter table public.logs enable row level security;

drop policy if exists "master only reads inventory adjustment logs" on public.logs;
create policy "master only reads inventory adjustment logs"
on public.logs
as restrictive
for select
to authenticated
using (
  not exists (
    select 1
    from public.customers customer
    where customer.id = logs.customer_id
      and btrim(customer.name) = '재고조정'
  )
  or exists (
    select 1
    from public.users app_user
    where app_user.id = auth.uid()
      and app_user.oss_role = 'master'
  )
);
