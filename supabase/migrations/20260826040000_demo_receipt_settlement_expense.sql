alter table public.settlement_expenses
  add column if not exists source_log_id bigint
  references public.logs(id) on delete cascade;

create unique index if not exists settlement_expenses_demo_source_log_unique
  on public.settlement_expenses(source_log_id)
  where source_log_id is not null and category = '시연용';

create or replace function public.sync_demo_receipt_settlement_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt_id uuid;
  v_receipt_date date;
  v_category_id uuid;
  v_amount integer;
  v_note text;
begin
  if tg_op = 'DELETE' then
    delete from public.settlement_expenses
    where source_log_id = old.id and category = '시연용';
    return old;
  end if;

  if new.category <> 'stamp'
    or coalesce(new.jsonb->>'purchaseReceiptId', '') = ''
    or not exists (
      select 1
      from jsonb_array_elements(coalesce(new.jsonb->'items', '[]'::jsonb)) entry(item)
      where coalesce(entry.item->>'remark', '') ~ '^시연용(?:$|[,\s(])'
    )
  then
    return new;
  end if;

  v_receipt_id := (new.jsonb->>'purchaseReceiptId')::uuid;

  select
    receipt.arrived_on,
    coalesce(sum(line.quantity * line.unit_price), 0)::integer,
    string_agg(
      line.item_name || ' ' || line.quantity::text || '개',
      ', ' order by line.id
    )
  into v_receipt_date, v_amount, v_note
  from public.inventory_purchase_receipts receipt
  join public.inventory_purchase_receipt_lines line
    on line.receipt_id = receipt.id
  join public.inventory_purchase_order_lines order_line
    on order_line.id = line.order_line_id
  where receipt.id = v_receipt_id
    and order_line.handling_type = 'demo'
  group by receipt.arrived_on;

  if v_receipt_date is null or coalesce(v_amount, 0) <= 0 then
    return new;
  end if;

  insert into public.settlement_expense_categories(name, is_active, created_by)
  values ('시연용', true, new.admin_id)
  on conflict(name) do update set is_active = true
  returning id into v_category_id;

  insert into public.settlement_expenses(
    expense_date, category_id, category, amount, store,
    is_recurring, note, created_by, source_log_id
  ) values (
    v_receipt_date, v_category_id, '시연용', v_amount, 'common',
    false, coalesce(v_note, '시연용 처리'), new.admin_id, new.id
  )
  on conflict (source_log_id) where
    source_log_id is not null and category = '시연용'
  do update set
    expense_date = excluded.expense_date,
    category_id = excluded.category_id,
    amount = excluded.amount,
    store = 'common',
    note = excluded.note,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_demo_receipt_settlement_expense_trigger
on public.logs;

create trigger sync_demo_receipt_settlement_expense_trigger
after insert or update of jsonb, category or delete on public.logs
for each row execute function public.sync_demo_receipt_settlement_expense();

revoke all on function public.sync_demo_receipt_settlement_expense()
from public, anon, authenticated;

-- 기존 입고 시연용 기록도 동일한 기준으로 소급 등록합니다.
insert into public.settlement_expense_categories(name, is_active, created_by)
select '시연용', true, app_user.id
from public.users app_user
where app_user.oss_role = 'master'
order by app_user.created_at
limit 1
on conflict(name) do update set is_active = true;

insert into public.settlement_expenses(
  expense_date, category_id, category, amount, store,
  is_recurring, note, created_by, source_log_id
)
select
  receipt.arrived_on,
  category.id,
  '시연용',
  sum(line.quantity * line.unit_price)::integer,
  'common',
  false,
  string_agg(line.item_name || ' ' || line.quantity::text || '개', ', ' order by line.id),
  log.admin_id,
  log.id
from public.logs log
join public.inventory_purchase_receipts receipt
  on receipt.id = nullif(log.jsonb->>'purchaseReceiptId', '')::uuid
join public.inventory_purchase_receipt_lines line
  on line.receipt_id = receipt.id
join public.inventory_purchase_order_lines order_line
  on order_line.id = line.order_line_id and order_line.handling_type = 'demo'
join public.settlement_expense_categories category on category.name = '시연용'
where log.category = 'stamp'
  and receipt.reversed_at is null
group by receipt.arrived_on, category.id, log.admin_id, log.id
having sum(line.quantity * line.unit_price) > 0
on conflict (source_log_id) where
  source_log_id is not null and category = '시연용'
do update set
  expense_date = excluded.expense_date,
  category_id = excluded.category_id,
  amount = excluded.amount,
  store = 'common',
  note = excluded.note,
  updated_at = now();
