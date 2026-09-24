-- 개별 이체 확인 프로그램은 2026-09-23 마감부터 도입됐다.
-- 이전 영업일을 다시 조회·마감해도 새 확인 절차를 요구하지 않는다.
create or replace function public.verify_daily_closing_transfer_verification(p_business_date date)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_entries jsonb;
begin
  if p_business_date < date '2026-09-23' then return true; end if;
  select entries into v_entries from public.daily_closing_transfer_verifications where business_date=p_business_date;
  if v_entries is null then
    return not exists (
      select 1 from public.logs l
      where l.category='stamp'
        and l.created_at >= (p_business_date::timestamp at time zone 'Asia/Seoul')
        and l.created_at < ((p_business_date + 1)::timestamp at time zone 'Asia/Seoul')
        and (l.jsonb->>'paymentType' in ('transfer','transfer_cash_receipt','egu_transfer','egu_transfer_cash_receipt') or jsonb_path_exists(l.jsonb, '$.payments[*] ? (@.paymentType == "transfer" || @.paymentType == "transfer_cash_receipt" || @.paymentType == "egu_transfer" || @.paymentType == "egu_transfer_cash_receipt")'));
  end if;
  perform public.save_daily_closing_transfer_verification(p_business_date, v_entries);
  return true;
exception when others then return false;
end $$;
