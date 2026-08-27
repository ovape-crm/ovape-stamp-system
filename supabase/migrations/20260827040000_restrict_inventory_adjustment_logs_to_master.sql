-- 재고조정 출고·입고는 마스터만 생성하거나 수정할 수 있다.
create or replace function public.enforce_inventory_adjustment_master()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category = 'stamp'
    and exists (
      select 1
      from public.customers customer
      where customer.id = new.customer_id
        and btrim(customer.name) = '재고조정'
    )
    and not exists (
      select 1
      from public.users app_user
      where app_user.id = auth.uid()
        and app_user.oss_role = 'master'
    )
  then
    raise exception 'INVENTORY_ADJUSTMENT_MASTER_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_inventory_adjustment_master_trigger
  on public.logs;
create trigger enforce_inventory_adjustment_master_trigger
before insert or update of customer_id, category, jsonb
on public.logs
for each row execute function public.enforce_inventory_adjustment_master();

revoke all on function public.enforce_inventory_adjustment_master()
  from public, anon, authenticated;
