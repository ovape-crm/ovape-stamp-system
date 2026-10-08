create or replace function public.sync_source_log_expense_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_at is distinct from old.created_at then
    update public.settlement_expenses
    set expense_date = (new.created_at at time zone 'Asia/Seoul')::date,
        updated_at = now()
    where source_log_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_sync_source_log_expense_date on public.logs;
create trigger zz_sync_source_log_expense_date
after update of created_at on public.logs
for each row execute function public.sync_source_log_expense_date();

revoke all on function public.sync_source_log_expense_date()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
