alter table public.customer_sheet_import_rows
  add column if not exists applied_from_status text,
  add column if not exists applied_from_selected_customer_id bigint references public.customers(id);

create or replace function public.apply_customer_sheet_import_batch_with_snapshot(p_batch_id uuid)
returns table(applied_rows integer, duplicate_rows integer, held_rows integer)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;
  perform 1 from public.customer_sheet_import_batches where id = p_batch_id for update;
  if not found then raise exception 'IMPORT_BATCH_NOT_FOUND'; end if;
  update public.customer_sheet_import_rows
  set applied_from_status = review_status,
      applied_from_selected_customer_id = selected_customer_id
  where batch_id = p_batch_id and review_status in ('matched', 'new_customer', 'x_transfer');
  return query select * from public.apply_customer_sheet_import_batch(p_batch_id);
end;
$$;

create or replace function public.rollback_customer_sheet_import_batch(p_batch_id uuid)
returns table(restored_rows integer, deleted_logs integer, deleted_customers integer)
language plpgsql security definer set search_path = public as $$
declare
  v_log_ids bigint[];
  v_new_customer_ids bigint[];
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;
  perform 1 from public.customer_sheet_import_batches where id = p_batch_id for update;
  if not found then raise exception 'IMPORT_BATCH_NOT_FOUND'; end if;

  select array_agg(applied_log_id), array_agg(selected_customer_id) filter (where applied_from_status = 'new_customer')
    into v_log_ids, v_new_customer_ids
  from public.customer_sheet_import_rows
  where batch_id = p_batch_id and review_status = 'applied' and applied_from_status is not null;

  delete from public.customer_sheet_import_applied_fingerprints where log_id = any(coalesce(v_log_ids, '{}'::bigint[]));
  delete from public.logs where id = any(coalesce(v_log_ids, '{}'::bigint[]));
  get diagnostics deleted_logs = row_count;

  update public.customer_sheet_import_rows
  set review_status = applied_from_status,
      selected_customer_id = applied_from_selected_customer_id,
      applied_log_id = null,
      applied_from_status = null,
      applied_from_selected_customer_id = null,
      updated_at = now()
  where batch_id = p_batch_id and review_status = 'applied' and applied_from_status is not null;
  get diagnostics restored_rows = row_count;

  delete from public.customers customer
  where customer.id = any(coalesce(v_new_customer_ids, '{}'::bigint[]))
    and not exists (select 1 from public.logs log where log.customer_id = customer.id);
  get diagnostics deleted_customers = row_count;
  return next;
end;
$$;

revoke all on function public.apply_customer_sheet_import_batch_with_snapshot(uuid), public.rollback_customer_sheet_import_batch(uuid) from public, anon;
grant execute on function public.apply_customer_sheet_import_batch_with_snapshot(uuid), public.rollback_customer_sheet_import_batch(uuid) to authenticated;
