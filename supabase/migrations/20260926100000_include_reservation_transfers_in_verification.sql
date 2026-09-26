-- 예약 당일에는 이체 확인 목록에만 표시하고 매출 합계에는 포함하지 않는다.
create or replace function public.save_daily_closing_transfer_verification(
  p_business_date date,
  p_entries jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_expected jsonb;
  v_submitted jsonb;
  v_name text;
  v_is_master boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists(select 1 from public.daily_closing_reports where business_date=p_business_date) then raise exception 'ALREADY_CLOSED'; end if;
  select coalesce(nullif(trim(name),''),'직원') into v_name from public.users where id=auth.uid();
  select exists(select 1 from public.users where id=auth.uid() and oss_role='master') into v_is_master;

  with payment_rows as (
    select l.id::text as log_id, l.category, (p.ordinality - 1)::integer as payment_index,
      p.value->>'paymentType' as payment_type,
      (p.value->>'amount')::numeric * case when coalesce((l.jsonb->>'totalAmount')::numeric,0) < 0 then -1 else 1 end as amount,
      l.jsonb, c.name as customer_name
    from public.logs l left join public.customers c on c.id=l.customer_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(l.jsonb->'payments')='array' then l.jsonb->'payments' else '[]'::jsonb end) with ordinality p(value, ordinality)
    where l.category in ('stamp','reservation') and l.created_at >= (p_business_date::timestamp at time zone 'Asia/Seoul') and l.created_at < ((p_business_date + 1)::timestamp at time zone 'Asia/Seoul')
    union all
    select l.id::text, l.category, 0, l.jsonb->>'paymentType', coalesce((l.jsonb->>'totalAmount')::numeric,0), l.jsonb, c.name
    from public.logs l left join public.customers c on c.id=l.customer_id
    where l.category in ('stamp','reservation') and coalesce(jsonb_array_length(l.jsonb->'payments'),0)=0 and l.created_at >= (p_business_date::timestamp at time zone 'Asia/Seoul') and l.created_at < ((p_business_date + 1)::timestamp at time zone 'Asia/Seoul')
  ), normalized as (
    select jsonb_build_object(
      'logId', log_id, 'paymentIndex', payment_index, 'paymentType', payment_type,
      'store', case when payment_type like 'egu_%' then 'eguVape' else 'ovape' end,
      'payerName', case
        when category='reservation' then concat(coalesce(nullif(trim(jsonb->>'transferPayerName'),''), nullif(trim(customer_name),''), '입금자명 미확인'), ' (금일 예약 이체건, 매출 합계X)')
        when jsonb ? 'reservationCreatedAt' then concat(
          coalesce(nullif(trim(jsonb->>'transferPayerName'),''), nullif(trim(customer_name),''), '입금자명 미확인'),
          ' (', to_char((jsonb->>'reservationCreatedAt')::timestamptz at time zone 'Asia/Seoul', 'MM/DD'), ' ', coalesce(nullif(trim(jsonb->>'reservationCreatedWorkerName'),''), nullif(trim(jsonb->>'createdWorkerName'),''), '작업자 미확인'), ' 예약) (재확인 : ', coalesce(nullif(trim(jsonb->>'confirmedWorkerName'),''), '작업자 미확인'), ')'
        )
        else coalesce(nullif(trim(jsonb->>'transferPayerName'),''), nullif(trim(jsonb->>'xCustomerName'),''), nullif(trim(customer_name),''), '입금자명 미확인')
      end,
      'amount', abs(amount)
    ) as entry
    from payment_rows where payment_type in ('transfer','transfer_cash_receipt','egu_transfer','egu_transfer_cash_receipt')
  )
  select coalesce(jsonb_agg(entry order by entry->>'logId', (entry->>'paymentIndex')::integer), '[]'::jsonb) into v_expected from normalized;

  select coalesce(jsonb_agg(jsonb_build_object(
    'logId', entry->>'logId', 'paymentIndex', (entry->>'paymentIndex')::integer, 'paymentType', entry->>'paymentType',
    'store', entry->>'store', 'payerName', entry->>'payerName', 'amount', abs((entry->>'amount')::numeric)
  ) order by entry->>'logId', (entry->>'paymentIndex')::integer), '[]'::jsonb)
  into v_submitted from jsonb_array_elements(coalesce(p_entries,'[]'::jsonb)) entry;

  if v_submitted is distinct from v_expected then
    if not v_is_master then raise exception 'TRANSFER_VERIFICATION_STALE'; end if;
    -- 마스터는 복구 시점에 화면에서 확인한 항목을 그대로 저장할 수 있다.
    v_expected := v_submitted;
  end if;
  insert into public.daily_closing_transfer_verifications(business_date,entries,verified_by,verified_by_name,verified_at,updated_at)
  values(p_business_date,v_expected,auth.uid(),v_name,now(),now())
  on conflict(business_date) do update set entries=excluded.entries,verified_by=excluded.verified_by,verified_by_name=excluded.verified_by_name,verified_at=excluded.verified_at,updated_at=now();
end $$;

-- 저장된 이체 확인이 없을 때도 예약 이체를 확인 대상으로 인식해 마감 전 저장을 강제한다.
create or replace function public.verify_daily_closing_transfer_verification(p_business_date date)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_entries jsonb;
begin
  select entries into v_entries from public.daily_closing_transfer_verifications where business_date=p_business_date;
  if v_entries is null then
    return not exists (
      select 1 from public.logs l
      where l.category in ('stamp','reservation')
        and l.created_at >= (p_business_date::timestamp at time zone 'Asia/Seoul')
        and l.created_at < ((p_business_date + 1)::timestamp at time zone 'Asia/Seoul')
        and (l.jsonb->>'paymentType' in ('transfer','transfer_cash_receipt','egu_transfer','egu_transfer_cash_receipt') or jsonb_path_exists(l.jsonb, '$.payments[*] ? (@.paymentType == "transfer" || @.paymentType == "transfer_cash_receipt" || @.paymentType == "egu_transfer" || @.paymentType == "egu_transfer_cash_receipt")')));
  end if;
  perform public.save_daily_closing_transfer_verification(p_business_date, v_entries);
  return true;
exception when others then return false;
end $$;
