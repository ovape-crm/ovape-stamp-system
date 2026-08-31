-- 기존 X 남자·X 여자 계정과 별도로, 신규 통합 X 고객 바로가기용 특수 계정을 만든다.
-- 성별은 고객 프로필이 아니라 신규 출고 로그의 xCustomerGender에 기록한다.
insert into public.customers (
  name,
  phone,
  gender,
  is_stamp_eligible,
  note,
  adult_verified,
  adult_verification_method
)
select
  'X',
  'X',
  'special',
  false,
  '통합 X 고객 특수계정. 성별은 각 출고 이력에서 확인합니다.',
  false,
  null
where not exists (
  select 1
  from public.customers
  where name = 'X' and phone = 'X' and gender = 'special'
);
