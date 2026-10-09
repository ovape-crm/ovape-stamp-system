-- 이체자 정보가 바뀌면, 아직 마감하지 않은 날짜의 개별 이체 확인만 무효화한다.
-- 화면에 표시되는 이체 범위를 서버가 다시 조회하지 않아 역할별 조회 범위 차이를 만들지 않는다.
create or replace function public.invalidate_open_transfer_verification_on_payer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_date date;
  v_payer_changed boolean;
begin
  if new.category not in ('stamp', 'reservation') then
    return new;
  end if;

  v_payer_changed :=
    old.jsonb->>'transferPayerName' is distinct from new.jsonb->>'transferPayerName'
    or old.jsonb->>'xCustomerName' is distinct from new.jsonb->>'xCustomerName'
    or old.jsonb->>'xPhoneLastDigits' is distinct from new.jsonb->>'xPhoneLastDigits';

  if not v_payer_changed then
    return new;
  end if;

  v_business_date := (new.created_at at time zone 'Asia/Seoul')::date;

  delete from public.daily_closing_transfer_verifications verification
  where verification.business_date = v_business_date
    and not exists (
      select 1
      from public.daily_closing_reports report
      where report.business_date = v_business_date
    );

  return new;
end;
$$;

drop trigger if exists invalidate_open_transfer_verification_on_payer_change_trigger on public.logs;
create trigger invalidate_open_transfer_verification_on_payer_change_trigger
after update of jsonb on public.logs
for each row execute function public.invalidate_open_transfer_verification_on_payer_change();

revoke all on function public.invalidate_open_transfer_verification_on_payer_change()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
