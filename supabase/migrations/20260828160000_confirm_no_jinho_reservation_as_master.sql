-- 노진호 예약 6638을 2026-08-28 15:21(KST)에 마스터가 출고확정한 이력으로 전환한다.
do $$
declare v_master uuid := '89ac28cf-264d-4a5d-ac86-5b44a08818ed'::uuid;
begin
  perform set_config('request.jwt.claim.sub', v_master::text, true);
  perform public.confirm_reservation_stamp_operation_v2('6638', '마스터');
  update public.logs
  set created_at='2026-08-28 06:21:00+00'::timestamptz,
      updated_at='2026-08-28 06:21:00+00'::timestamptz
  where id=6638 and category='stamp';
  update public.inventory_cost_events
  set event_at='2026-08-28 06:21:00+00'::timestamptz
  where reference_type='stamp_log' and reference_id='6638';
end $$;
