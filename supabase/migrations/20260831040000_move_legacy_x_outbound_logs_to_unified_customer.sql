-- 기존 X 남자·X 여자 계정의 출고/예약 이력을 통합 X 특수계정으로 옮긴다.
-- 성별은 각 로그의 xCustomerGender 스냅샷을 유지한다.
do $$
declare
  v_master uuid := '89ac28cf-264d-4a5d-ac86-5b44a08818ed'::uuid;
  v_unified_customer_id bigint;
begin
  select id into v_unified_customer_id
  from public.customers
  where name = 'X' and phone = 'X' and gender = 'special'
  limit 1;

  if v_unified_customer_id is null then
    raise exception 'UNIFIED_X_CUSTOMER_NOT_FOUND';
  end if;

  perform set_config('request.jwt.claim.sub', v_master::text, true);

  update public.logs log
  set customer_id = v_unified_customer_id
  from public.customers legacy_customer
  where legacy_customer.id = log.customer_id
    and legacy_customer.name = 'X'
    and legacy_customer.phone = 'X'
    and legacy_customer.gender in ('male', 'female')
    and log.category in ('stamp', 'reservation');
end $$;
