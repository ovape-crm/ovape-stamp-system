-- 기존 출고 이력은 배송비가 jsonb가 아닌 이력 문구에만 남아 있는 경우가 있다.
-- 이 경우에도 택배비/배달대행비를 기타비용으로 반영한다. 기존 비용은 삭제하지 않는다.

create or replace function public.sync_outbound_delivery_fee_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer;
  v_category text;
  v_category_id uuid;
  v_store text;
  v_customer_name text;
  v_customer_phone text;
  v_fee_text text;
begin
  if tg_op = 'DELETE' then
    delete from public.settlement_expenses
    where source_log_id = old.id
      and category in ('택배비', '배달대행비');
    return old;
  end if;

  if new.category <> 'stamp' then
    delete from public.settlement_expenses
    where source_log_id = new.id
      and category in ('택배비', '배달대행비');
    return new;
  end if;

  -- 신규 형식: 구조화된 배송 정보(jsonb)를 우선 사용한다.
  if new.jsonb->>'deliveryMethod' = 'parcel' then
    v_category := '택배비';
    v_fee_text := new.jsonb->>'deliveryFee';
  elsif new.jsonb->>'deliveryMethod' = 'delivery'
    and new.jsonb->>'deliveryType' = 'agency' then
    v_category := '배달대행비';
    v_fee_text := new.jsonb->>'deliveryFee';
  -- 이전 형식: 예) (우체국택배3880), (배달대행비5500)
  elsif coalesce(new.note, '') ~ '택배(?:비)?[0-9]+' then
    v_category := '택배비';
    v_fee_text := substring(new.note from '택배(?:비)?([0-9]+)');
  elsif coalesce(new.note, '') ~ '배달대행비[0-9]+' then
    v_category := '배달대행비';
    v_fee_text := substring(new.note from '배달대행비([0-9]+)');
  else
    delete from public.settlement_expenses
    where source_log_id = new.id
      and category in ('택배비', '배달대행비');
    return new;
  end if;

  if coalesce(v_fee_text, '') !~ '^\d+(\.\d+)?$' then
    return new;
  end if;
  v_amount := v_fee_text::numeric::integer;
  if v_amount <= 0 then
    return new;
  end if;

  select name, phone into v_customer_name, v_customer_phone
  from public.customers where id = new.customer_id;
  v_store := case
    when new.jsonb->>'storeName' in ('ovape', 'eguvape')
      then new.jsonb->>'storeName'
    else 'ovape'
  end;

  insert into public.settlement_expense_categories(name, is_active, created_by)
  values (v_category, true, new.admin_id)
  on conflict (name) do update set is_active = true
  returning id into v_category_id;

  insert into public.settlement_expenses(
    expense_date, category_id, category, amount, store,
    is_recurring, note, created_by, source_log_id
  ) values (
    (new.created_at at time zone 'Asia/Seoul')::date,
    v_category_id, v_category, v_amount, v_store,
    false,
    coalesce(nullif(btrim(v_customer_name), ''), '고객 미지정') || ',' ||
      coalesce(nullif(btrim(v_customer_phone), ''), '번호 없음') || ' ' || v_category,
    new.admin_id, new.id
  ) on conflict (source_log_id) where source_log_id is not null
    and category in ('택배비', '배달대행비')
  do update set
    expense_date = excluded.expense_date,
    category_id = excluded.category_id,
    category = excluded.category,
    amount = excluded.amount,
    store = excluded.store,
    note = excluded.note,
    updated_at = now();

  return new;
end;
$$;

-- 요청 범위인 8월 2일 이후 출고 이력만 소급 추가한다.
-- 기존 기타비용 행은 건드리지 않고, 같은 출고 이력은 source_log_id로 갱신만 한다.
with delivery_logs as (
  select
    log.*,
    case
      when log.jsonb->>'deliveryMethod' = 'parcel' then '택배비'
      when log.jsonb->>'deliveryMethod' = 'delivery'
        and log.jsonb->>'deliveryType' = 'agency' then '배달대행비'
      when coalesce(log.note, '') ~ '택배(?:비)?[0-9]+' then '택배비'
      when coalesce(log.note, '') ~ '배달대행비[0-9]+' then '배달대행비'
    end as expense_category,
    case
      when log.jsonb->>'deliveryMethod' = 'parcel'
        or (log.jsonb->>'deliveryMethod' = 'delivery' and log.jsonb->>'deliveryType' = 'agency')
        then log.jsonb->>'deliveryFee'
      when coalesce(log.note, '') ~ '택배(?:비)?[0-9]+'
        then substring(log.note from '택배(?:비)?([0-9]+)')
      when coalesce(log.note, '') ~ '배달대행비[0-9]+'
        then substring(log.note from '배달대행비([0-9]+)')
    end as fee_text
  from public.logs log
  where log.category = 'stamp'
    and (log.created_at at time zone 'Asia/Seoul')::date >= date '2026-08-02'
)
insert into public.settlement_expenses(
  expense_date, category_id, category, amount, store,
  is_recurring, note, created_by, source_log_id
)
select
  (log.created_at at time zone 'Asia/Seoul')::date,
  category.id,
  log.expense_category,
  log.fee_text::numeric::integer,
  case when log.jsonb->>'storeName' in ('ovape', 'eguvape') then log.jsonb->>'storeName' else 'ovape' end,
  false,
  coalesce(nullif(btrim(customer.name), ''), '고객 미지정') || ',' ||
    coalesce(nullif(btrim(customer.phone), ''), '번호 없음') || ' ' || log.expense_category,
  log.admin_id,
  log.id
from delivery_logs log
join public.customers customer on customer.id = log.customer_id
join public.settlement_expense_categories category on category.name = log.expense_category
where log.expense_category is not null
  and coalesce(log.fee_text, '') ~ '^\d+(\.\d+)?$'
  and log.fee_text::numeric > 0
on conflict (source_log_id) where source_log_id is not null
  and category in ('택배비', '배달대행비')
do update set
  expense_date = excluded.expense_date,
  category_id = excluded.category_id,
  category = excluded.category,
  amount = excluded.amount,
  store = excluded.store,
  note = excluded.note,
  updated_at = now();
