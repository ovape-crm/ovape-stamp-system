-- 화면 밖의 직접 상태 변경 경로에서도 재고처리 X가 완료형 수리 입고가 되지 않도록 막는다.
create or replace function public.normalize_non_inventory_after_service_repair_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'repair_returned_completed'
    and coalesce(new.is_loaner_device_issued, false) = false then
    new.status := 'repair_returned';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_non_inventory_after_service_repair_status on public.after_services;
create trigger normalize_non_inventory_after_service_repair_status
before insert or update of status, is_loaner_device_issued on public.after_services
for each row execute function public.normalize_non_inventory_after_service_repair_status();
