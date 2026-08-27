-- 재고처리 X A/S는 재고 입고 완료 상태가 아니라 일반 수리 입고 상태로 끝난다.
-- 이전 처리 중 완료형 상태로 남은 기록도 같은 기준으로 바로잡는다.
update public.after_services
set status = 'repair_returned'
where status = 'repair_returned_completed'
  and coalesce(is_loaner_device_issued, false) = false;
