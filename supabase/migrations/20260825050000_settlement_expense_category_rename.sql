create or replace function public.rename_settlement_expense_category(
  p_category_id uuid,
  p_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'master'
  ) then raise exception 'MASTER_REQUIRED'; end if;
  if v_name = '' then raise exception 'CATEGORY_NAME_REQUIRED'; end if;
  if not exists (
    select 1 from public.settlement_expense_categories where id = p_category_id
  ) then raise exception 'CATEGORY_NOT_FOUND'; end if;

  update public.settlement_expense_categories
  set name = v_name
  where id = p_category_id;

  update public.settlement_expenses
  set category = v_name
  where category_id = p_category_id;
end;
$$;

revoke all on function public.rename_settlement_expense_category(uuid, text)
  from public, anon, authenticated;
grant execute on function public.rename_settlement_expense_category(uuid, text)
  to authenticated;
