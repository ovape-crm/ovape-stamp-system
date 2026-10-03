-- 화면에 표시된 이체 목록을 그대로 저장한다.
-- 저장 시 서버에서 전체 이체 목록을 다시 조회하면, 권한별 조회 범위 차이로 staff/admin 저장이 막힐 수 있다.
create or replace function public.save_daily_closing_transfer_verification(
  p_business_date date,
  p_entries jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists (select 1 from public.daily_closing_reports where business_date = p_business_date) then
    raise exception 'ALREADY_CLOSED';
  end if;

  select coalesce(nullif(trim(name), ''), '직원') into v_name
  from public.users where id = auth.uid();

  -- 저장 화면에서 다시 동일하게 표시할 수 있도록 사용자에게 보인 원본 항목을 보관한다.
  insert into public.daily_closing_transfer_verifications(
    business_date, entries, verified_by, verified_by_name, verified_at, updated_at
  ) values (
    p_business_date, coalesce(p_entries, '[]'::jsonb), auth.uid(), v_name, now(), now()
  ) on conflict (business_date) do update set
    entries = excluded.entries,
    verified_by = excluded.verified_by,
    verified_by_name = excluded.verified_by_name,
    verified_at = excluded.verified_at,
    updated_at = now();
end $$;

revoke all on function public.save_daily_closing_transfer_verification(date, jsonb) from public;
grant execute on function public.save_daily_closing_transfer_verification(date, jsonb) to authenticated;

notify pgrst, 'reload schema';
