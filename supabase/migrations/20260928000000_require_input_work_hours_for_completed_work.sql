-- 입력 근무시간은 급여 산정의 유일한 기준이다.
-- 출근 중인 기록은 아직 입력값이 없을 수 있지만, 종료된 기록은 반드시
-- 0보다 크고 24 이하의 입력 근무시간을 가져야 한다.
alter table public.work_journals
  add constraint work_journals_completed_input_work_hours_required
  check (
    status = 'working'
    or (
      input_work_hours is not null
      and input_work_hours > 0
      and input_work_hours <= 24
    )
  ) not valid;

-- 기존 보정 전 기록은 유지하되, 새로 저장하거나 수정하는 종료 기록에는
-- 위 제약이 즉시 적용된다. 기존 기록을 모두 보정한 뒤에는 validate 할 수 있다.

create or replace function public.require_input_work_hours_for_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payment_status <> 'unpaid'
     and (
       new.input_work_hours is null
       or new.input_work_hours <= 0
       or new.input_work_hours > 24
     ) then
    raise exception 'INPUT_WORK_HOURS_REQUIRED'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists require_input_work_hours_for_payment
  on public.work_journals;
create trigger require_input_work_hours_for_payment
before insert or update of payment_status
on public.work_journals
for each row execute function public.require_input_work_hours_for_payment();
