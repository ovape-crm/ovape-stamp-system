-- 사용자가 관리하는 공통 카테고리명으로 고객 교환 원가차액을 통일한다.
create or replace function public.normalize_customer_exchange_difference_category()
returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_category_id uuid;
begin
  if new.category <> '고객 교환 원가차액' then return new; end if;
  select id into v_category_id
  from public.settlement_expense_categories
  where name = '고객 교환 차액' and is_active = true
  limit 1;
  if v_category_id is null then
    raise exception 'CUSTOMER_EXCHANGE_DIFFERENCE_CATEGORY_REQUIRED';
  end if;
  update public.settlement_expenses
  set category = '고객 교환 차액', category_id = v_category_id, updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists zzzz_normalize_customer_exchange_difference_category on public.settlement_expenses;
create trigger zzzz_normalize_customer_exchange_difference_category
after insert or update of category on public.settlement_expenses
for each row execute function public.normalize_customer_exchange_difference_category();

update public.settlement_expenses expense
set category = '고객 교환 차액', category_id = category.id, updated_at = now()
from public.settlement_expense_categories category
where expense.category = '고객 교환 원가차액'
  and category.name = '고객 교환 차액';

update public.settlement_expense_categories
set is_active = false
where name = '고객 교환 원가차액';
