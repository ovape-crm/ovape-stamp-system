-- Persist the role hierarchy in the database: staff < admin < master.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'users'
      and constraint_type = 'CHECK'
      and constraint_name in (
        select conname
        from pg_constraint
        where conrelid = 'public.users'::regclass
          and pg_get_constraintdef(oid) ilike '%oss_role%'
      )
  loop
    execute format('alter table public.users drop constraint %I', constraint_row.constraint_name);
  end loop;
end $$;

alter table public.users
  add constraint users_oss_role_check
  check (oss_role in ('staff', 'admin', 'master'));

create or replace function public.has_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  );
$$;

revoke all on function public.has_admin_access() from public;
grant execute on function public.has_admin_access() to authenticated;

-- Update already-deployed security-definer functions that used exact role comparisons.
do $$
declare
  function_row record;
  definition text;
begin
  for function_row in
    select procedure.oid
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
  loop
    definition := pg_get_functiondef(function_row.oid);
    if definition like '%oss_role = ''admin''%'
      or definition like '%oss_role in (''staff'', ''admin'')%'
    then
      definition := replace(definition, 'oss_role = ''admin''', 'oss_role in (''admin'', ''master'')');
      definition := replace(definition, 'oss_role in (''staff'', ''admin'')', 'oss_role in (''staff'', ''admin'', ''master'')');
      execute definition;
    end if;
  end loop;
end $$;

drop policy if exists "authenticated staff and admins can update customers" on public.customers;
create policy "authenticated staff and admins can update customers"
on public.customers for update to authenticated
using (exists (select 1 from public.users where id = auth.uid() and oss_role in ('staff', 'admin', 'master')))
with check (exists (select 1 from public.users where id = auth.uid() and oss_role in ('staff', 'admin', 'master')));

drop policy if exists "admins can delete handover memos" on public.handover_memos;
create policy "admins can delete handover memos"
on public.handover_memos for delete to authenticated
using (public.has_admin_access());

drop policy if exists "admins can save product search column settings" on public.product_search_column_settings;
create policy "admins can save product search column settings"
on public.product_search_column_settings for all to authenticated
using (public.has_admin_access()) with check (public.has_admin_access());

drop policy if exists "admins read purchase adjustment categories" on public.inventory_purchase_adjustment_categories;
create policy "admins read purchase adjustment categories"
on public.inventory_purchase_adjustment_categories for select to authenticated
using (public.has_admin_access());

drop policy if exists "admins read purchase order adjustments" on public.inventory_purchase_order_adjustments;
create policy "admins read purchase order adjustments"
on public.inventory_purchase_order_adjustments for select to authenticated
using (public.has_admin_access());

drop policy if exists "staff can read adult verification requests" on public.adult_verification_requests;
create policy "staff can read adult verification requests"
on public.adult_verification_requests for select to authenticated
using (exists (select 1 from public.users where id = auth.uid() and oss_role in ('staff', 'admin', 'master')));

drop policy if exists "admins can save adult verification guide settings" on public.adult_verification_guide_settings;
create policy "admins can save adult verification guide settings"
on public.adult_verification_guide_settings for all to authenticated
using (public.has_admin_access()) with check (public.has_admin_access());

drop policy if exists "admins can save manual help bindings" on public.manual_help_bindings;
create policy "admins can save manual help bindings"
on public.manual_help_bindings for all to authenticated
using (public.has_admin_access()) with check (public.has_admin_access());
