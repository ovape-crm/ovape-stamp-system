-- 고객 이력 이전은 별도 변경 이력으로 남긴다.
create or replace function public.audit_log_customer_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_customer record;
  v_to_customer record;
  v_worker_name text;
begin
  if new.customer_id is not distinct from old.customer_id then
    return new;
  end if;

  select name, phone into v_from_customer from public.customers where id = old.customer_id;
  select name, phone into v_to_customer from public.customers where id = new.customer_id;
  select case
    when oss_role = 'master' then '마스터'
    when oss_role = 'admin' then '관리자'
    else coalesce(nullif(btrim(name), ''), email, '알 수 없음')
  end into v_worker_name
  from public.users
  where id = auth.uid();

  new.jsonb := coalesce(new.jsonb, '{}'::jsonb) || jsonb_build_object(
    'transferHistory',
      coalesce(new.jsonb->'transferHistory', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'transferredAt', now(),
          'workerName', coalesce(v_worker_name, '알 수 없음'),
          'fromCustomerName', coalesce(v_from_customer.name, '알 수 없음'),
          'fromCustomerPhone', coalesce(v_from_customer.phone, ''),
          'toCustomerName', coalesce(v_to_customer.name, '알 수 없음'),
          'toCustomerPhone', coalesce(v_to_customer.phone, '')
        )
      )
  );
  return new;
end;
$$;

drop trigger if exists zzzz_audit_log_customer_transfer_trigger on public.logs;
create trigger zzzz_audit_log_customer_transfer_trigger
before update of customer_id on public.logs
for each row execute function public.audit_log_customer_transfer();

-- 방금까지 이전된 X 통합 이력도 같은 형식의 이전 기록으로 보정한다.
update public.logs log
set jsonb = coalesce(log.jsonb, '{}'::jsonb) || jsonb_build_object(
  'transferHistory', jsonb_build_array(jsonb_build_object(
    'transferredAt', coalesce(
      (log.jsonb->'masterHistoryEdits'->0->>'editedAt')::timestamptz,
      log.updated_at
    ),
    'workerName', coalesce(
      (
        select case
          when user_row.oss_role = 'master' then '마스터'
          when user_row.oss_role = 'admin' then '관리자'
          else coalesce(nullif(btrim(user_row.name), ''), user_row.email, '알 수 없음')
        end
        from public.users user_row
        where user_row.id::text = log.jsonb->'masterHistoryEdits'->0->>'editedBy'
      ),
      '알 수 없음'
    ),
    'fromCustomerName', 'X 통합',
    'fromCustomerPhone', 'X',
    'toCustomerName', target_customer.name,
    'toCustomerPhone', target_customer.phone
  ))
)
from public.customers target_customer
where target_customer.id = log.customer_id
  and jsonb_typeof(log.jsonb->'xTransfer') = 'object'
  and jsonb_typeof(log.jsonb->'transferHistory') is null;

revoke all on function public.audit_log_customer_transfer() from public, anon, authenticated;
