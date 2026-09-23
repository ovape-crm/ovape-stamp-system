create table if not exists public.daily_closing_transfer_verifications (
  business_date date primary key,
  entries jsonb not null default '[]'::jsonb,
  verified_by uuid not null references auth.users(id),
  verified_by_name text not null,
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_closing_transfer_verifications enable row level security;

drop policy if exists "authenticated users can read daily closing transfer verifications" on public.daily_closing_transfer_verifications;
create policy "authenticated users can read daily closing transfer verifications"
on public.daily_closing_transfer_verifications for select to authenticated using (true);

create or replace function public.save_daily_closing_transfer_verification(
  p_business_date date,
  p_entries jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_expected jsonb;
  v_submitted jsonb;
  v_name text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists(select 1 from public.daily_closing_reports where business_date=p_business_date) then raise exception 'ALREADY_CLOSED'; end if;

  with payment_rows as (
    select l.id::text as log_id, (p.ordinality - 1)::integer as payment_index,
      p.value->>'paymentType' as payment_type,
      (p.value->>'amount')::numeric * case when coalesce((l.jsonb->>'totalAmount')::numeric,0) < 0 then -1 else 1 end as amount,
      l.jsonb, c.name as customer_name
    from public.logs l left join public.customers c on c.id=l.customer_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(l.jsonb->'payments')='array' then l.jsonb->'payments' else '[]'::jsonb end) with ordinality p(value, ordinality)
    where l.category='stamp' and l.created_at >= (p_business_date::timestamp at time zone 'Asia/Seoul') and l.created_at < ((p_business_date + 1)::timestamp at time zone 'Asia/Seoul')
    union all
    select l.id::text, 0, l.jsonb->>'paymentType', coalesce((l.jsonb->>'totalAmount')::numeric,0), l.jsonb, c.name
    from public.logs l left join public.customers c on c.id=l.customer_id
    where l.category='stamp' and coalesce(jsonb_array_length(l.jsonb->'payments'),0)=0 and l.created_at >= (p_business_date::timestamp at time zone 'Asia/Seoul') and l.created_at < ((p_business_date + 1)::timestamp at time zone 'Asia/Seoul')
  ), normalized as (
    select jsonb_build_object(
      'logId', log_id, 'paymentIndex', payment_index, 'paymentType', payment_type,
      'store', case when payment_type like 'egu_%' then 'eguVape' else 'ovape' end,
      'payerName', coalesce(nullif(trim((regexp_match(coalesce(jsonb->>'extraNote',''), '입금자명\s*:\s*([^,\n]+)'))[1]),''), nullif(trim(jsonb->>'transferPayerName'),''), nullif(trim(jsonb->>'xCustomerName'),''), nullif(trim(customer_name),''), '입금자명 미확인'),
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

  if v_submitted is distinct from v_expected then raise exception 'TRANSFER_VERIFICATION_STALE'; end if;
  select coalesce(nullif(trim(name),''),'직원') into v_name from public.users where id=auth.uid();
  insert into public.daily_closing_transfer_verifications(business_date,entries,verified_by,verified_by_name,verified_at,updated_at)
  values(p_business_date,v_expected,auth.uid(),v_name,now(),now())
  on conflict(business_date) do update set entries=excluded.entries,verified_by=excluded.verified_by,verified_by_name=excluded.verified_by_name,verified_at=excluded.verified_at,updated_at=now();
end $$;

create or replace function public.get_daily_closing_transfer_verification(p_business_date date)
returns table(entries jsonb, verified_by_name text, verified_at timestamptz)
language sql stable security definer set search_path=public as $$
  select entries, verified_by_name, verified_at from public.daily_closing_transfer_verifications where business_date=p_business_date;
$$;

revoke all on function public.save_daily_closing_transfer_verification(date,jsonb) from public;
grant execute on function public.save_daily_closing_transfer_verification(date,jsonb) to authenticated;
revoke all on function public.get_daily_closing_transfer_verification(date) from public;
grant execute on function public.get_daily_closing_transfer_verification(date) to authenticated;

create or replace function public.verify_daily_closing_transfer_verification(p_business_date date)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_entries jsonb; begin
  select entries into v_entries from public.daily_closing_transfer_verifications where business_date=p_business_date;
  if v_entries is null then
    return not exists (
      select 1 from public.logs l
      where l.category='stamp'
        and l.created_at >= (p_business_date::timestamp at time zone 'Asia/Seoul')
        and l.created_at < ((p_business_date + 1)::timestamp at time zone 'Asia/Seoul')
        and (
          l.jsonb->>'paymentType' in ('transfer','transfer_cash_receipt','egu_transfer','egu_transfer_cash_receipt')
          or jsonb_path_exists(l.jsonb, '$.payments[*] ? (@.paymentType == "transfer" || @.paymentType == "transfer_cash_receipt" || @.paymentType == "egu_transfer" || @.paymentType == "egu_transfer_cash_receipt")')
        )
    );
  end if;
  perform public.save_daily_closing_transfer_verification(p_business_date, v_entries);
  return true;
exception when others then return false;
end $$;

revoke all on function public.verify_daily_closing_transfer_verification(date) from public;
grant execute on function public.verify_daily_closing_transfer_verification(date) to authenticated;

create or replace function public.guard_daily_closing_transfer_verification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.verify_daily_closing_transfer_verification(new.business_date) then
    raise exception 'TRANSFER_VERIFICATION_REQUIRED';
  end if;
  return new;
end $$;

drop trigger if exists guard_daily_closing_transfer_verification_trigger on public.daily_closing_reports;
create trigger guard_daily_closing_transfer_verification_trigger
before insert on public.daily_closing_reports
for each row execute function public.guard_daily_closing_transfer_verification();
