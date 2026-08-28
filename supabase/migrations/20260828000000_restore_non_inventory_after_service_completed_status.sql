-- 2026-08-27의 일괄 상태 정규화를 되돌린다.
-- 완료 처리 이력이 실제로 남아 있는 건만 복원하여, 원래부터 진행 중이던
-- 일반 수리 입고(repair_returned)는 변경하지 않는다.
drop trigger if exists normalize_non_inventory_after_service_repair_status
  on public.after_services;

drop function if exists public.normalize_non_inventory_after_service_repair_status();

update public.after_services as after_service
set status = 'repair_returned_completed'
where after_service.status = 'repair_returned'
  and coalesce(after_service.is_loaner_device_issued, false) = false
  and exists (
    select 1
    from public.logs as log
    where log.after_service_id = after_service.id
      and log.category = 'after_service'
      and log.action = 'after-service-repair_returned_completed'
  );
