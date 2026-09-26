-- 마스터는 복구·정정 업무를 위해 이체 확인 저장 여부와 관계없이 마감을 다시 처리할 수 있다.
-- 일반 직원과 관리자는 기존의 이체 확인 강제 규칙을 그대로 적용받는다.
create or replace function public.guard_daily_closing_transfer_verification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists (
    select 1
    from public.users
    where id = auth.uid()
      and oss_role = 'master'
  ) then
    return new;
  end if;

  if not public.verify_daily_closing_transfer_verification(new.business_date) then
    raise exception 'TRANSFER_VERIFICATION_REQUIRED';
  end if;
  return new;
end $$;
