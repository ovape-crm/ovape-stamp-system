-- 업체 교환출고 이력 전용 특수계정. 재고조정 처리 화면과는 연결하지 않는다.
insert into public.customers (name, phone, gender, is_stamp_eligible)
select '매장제품 A/S', '-', 'special', false
where not exists (
  select 1
  from public.customers customer
  where btrim(customer.name) = '매장제품 A/S'
);

-- 스태프는 특수계정의 원본 이력에 직접 접근할 수 없고, 관리자·마스터만 조회한다.
alter table public.logs enable row level security;

drop policy if exists "admin and master read store product after service logs" on public.logs;
create policy "admin and master read store product after service logs"
on public.logs
as restrictive
for select
to authenticated
using (
  not exists (
    select 1
    from public.customers customer
    where customer.id = logs.customer_id
      and btrim(customer.name) = '매장제품 A/S'
  )
  or exists (
    select 1
    from public.users app_user
    where app_user.id = auth.uid()
      and app_user.oss_role in ('admin', 'master')
  )
);
