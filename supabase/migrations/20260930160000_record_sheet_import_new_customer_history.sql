-- 시트에서 새로 만든 고객도 일반 고객 추가와 같은 고객 이력을 남긴다.
create or replace function public.record_customer_sheet_import_new_customer_history(p_batch_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_inserted integer;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;
  insert into public.logs(admin_id, customer_id, action, note, jsonb, category)
  select auth.uid(), source.customer_id, 'create-customer', '',
    jsonb_build_object('historicalSheetImportCustomerCreated', true, 'batchId', p_batch_id), 'customer'
  from (
    select distinct selected_customer_id as customer_id
    from public.customer_sheet_import_rows
    where batch_id = p_batch_id and applied_from_status = 'new_customer' and review_status = 'applied'
  ) source
  where not exists (
    select 1 from public.logs log
    where log.customer_id = source.customer_id
      and log.category = 'customer'
      and log.action = 'create-customer'
      and log.jsonb->>'batchId' = p_batch_id::text
  );
  get diagnostics v_inserted = row_count;
  return v_inserted;
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
  select array_agg(log_id), array_agg(customer_id) filter (where from_status = 'new_customer') into v_log_ids, v_new_customer_ids
  from (
    select r.applied_log_id as log_id, r.selected_customer_id as customer_id, r.applied_from_status as from_status
    from public.customer_sheet_import_rows r
    where r.batch_id = p_batch_id and r.review_status = 'applied' and r.applied_from_status is not null
    union all
    select l.id, l.customer_id, 'new_customer'
    from public.logs l
    where l.category = 'customer' and l.action = 'create-customer' and l.jsonb->>'batchId' = p_batch_id::text
  ) affected;
  delete from public.customer_sheet_import_applied_fingerprints where log_id = any(coalesce(v_log_ids, '{}'::bigint[]));
  delete from public.logs where id = any(coalesce(v_log_ids, '{}'::bigint[]));
  get diagnostics deleted_logs = row_count;
  update public.customer_sheet_import_rows set review_status = applied_from_status, selected_customer_id = applied_from_selected_customer_id,
    applied_log_id = null, applied_from_status = null, applied_from_selected_customer_id = null, updated_at = now()
  where batch_id = p_batch_id and review_status = 'applied' and applied_from_status is not null;
  get diagnostics restored_rows = row_count;
  delete from public.customers customer where customer.id = any(coalesce(v_new_customer_ids, '{}'::bigint[]))
    and not exists (select 1 from public.logs log where log.customer_id = customer.id);
  get diagnostics deleted_customers = row_count;
  return next;
end;
$$;

revoke all on function public.record_customer_sheet_import_new_customer_history(uuid) from public, anon;
grant execute on function public.record_customer_sheet_import_new_customer_history(uuid) to authenticated;
