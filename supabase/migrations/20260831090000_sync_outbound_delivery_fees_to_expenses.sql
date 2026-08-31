create unique index if not exists settlement_expenses_delivery_fee_source_log_unique
  on public.settlement_expenses (source_log_id)
  where source_log_id is not null
    and category in ('택배비', '배달대행비');

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

  if new.jsonb->>'deliveryMethod' = 'parcel' then
    v_category := '택배비';
  elsif new.jsonb->>'deliveryMethod' = 'delivery'
    and new.jsonb->>'deliveryType' = 'agency' then
    v_category := '배달대행비';
  else
    delete from public.settlement_expenses
    where source_log_id = new.id
      and category in ('택배비', '배달대행비');
    return new;
  end if;

  v_amount := nullif(new.jsonb->>'deliveryFee', '')::numeric::integer;
  if coalesce(v_amount, 0) <= 0 then
    delete from public.settlement_expenses
    where source_log_id = new.id
      and category in ('택배비', '배달대행비');
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

drop trigger if exists zzz_sync_outbound_delivery_fee_expense_trigger on public.logs;
create trigger zzz_sync_outbound_delivery_fee_expense_trigger
after insert or update of jsonb, category, customer_id, created_at or delete
on public.logs
for each row execute function public.sync_outbound_delivery_fee_expense();

revoke all on function public.sync_outbound_delivery_fee_expense()
  from public, anon, authenticated;

insert into public.settlement_expense_categories(name, is_active, created_by)
select '택배비', true, id from public.users where oss_role = 'master'
order by created_at limit 1
on conflict (name) do update set is_active = true;

insert into public.settlement_expense_categories(name, is_active, created_by)
select '배달대행비', true, id from public.users where oss_role = 'master'
order by created_at limit 1
on conflict (name) do update set is_active = true;

insert into public.settlement_expenses(
  expense_date, category_id, category, amount, store,
  is_recurring, note, created_by, source_log_id
)
select
  (log.created_at at time zone 'Asia/Seoul')::date,
  category.id,
  case when log.jsonb->>'deliveryMethod' = 'parcel' then '택배비' else '배달대행비' end,
  (log.jsonb->>'deliveryFee')::numeric::integer,
  case when log.jsonb->>'storeName' in ('ovape', 'eguvape') then log.jsonb->>'storeName' else 'ovape' end,
  false,
  coalesce(nullif(btrim(customer.name), ''), '고객 미지정') || ',' ||
    coalesce(nullif(btrim(customer.phone), ''), '번호 없음') || ' ' ||
    case when log.jsonb->>'deliveryMethod' = 'parcel' then '택배비' else '배달대행비' end,
  log.admin_id,
  log.id
from public.logs log
join public.customers customer on customer.id = log.customer_id
join public.settlement_expense_categories category on category.name =
  case when log.jsonb->>'deliveryMethod' = 'parcel' then '택배비' else '배달대행비' end
where log.category = 'stamp'
  and (
    log.jsonb->>'deliveryMethod' = 'parcel'
    or (log.jsonb->>'deliveryMethod' = 'delivery' and log.jsonb->>'deliveryType' = 'agency')
  )
  and coalesce(log.jsonb->>'deliveryFee', '') ~ '^\\d+(\\.\\d+)?$'
  and (log.jsonb->>'deliveryFee')::numeric > 0
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
