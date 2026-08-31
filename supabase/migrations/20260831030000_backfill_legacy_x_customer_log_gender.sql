-- 기존 X 남자·X 여자 계정의 출고/예약 이력에 계정 성별을 스냅샷으로 기록한다.
-- 이미 통합 X 고객에서 직접 선택해 저장한 성별은 덮어쓰지 않는다.
do $$
declare
  v_master uuid := '89ac28cf-264d-4a5d-ac86-5b44a08818ed'::uuid;
begin
  -- 로그 감사 트리거가 실행 사용자를 요구하므로 마스터 컨텍스트에서 보정한다.
  perform set_config('request.jwt.claim.sub', v_master::text, true);

  update public.logs log
  set jsonb = jsonb_set(
    coalesce(log.jsonb, '{}'::jsonb),
    '{xCustomerGender}',
    to_jsonb(customer.gender),
    true
  )
  from public.customers customer
  where customer.id = log.customer_id
    and customer.name = 'X'
    and customer.phone = 'X'
    and customer.gender in ('male', 'female')
    and log.category in ('stamp', 'reservation')
    and coalesce(log.jsonb->>'xCustomerGender', '') not in ('male', 'female');
end $$;
