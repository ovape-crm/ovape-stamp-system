-- 신규 고객 후보는 성별 모름을 그대로 보존하고, 대량 반영 시 API 제한을 피한다.
create or replace function public.apply_customer_sheet_import_new_chunk_with_snapshot(
  p_batch_id uuid,
  p_limit integer default 200
)
returns table(applied_rows integer, duplicate_rows integer, held_rows integer)
language plpgsql security definer set search_path = public as $$
declare
  v_target_ids bigint[];
  v_unknown_ids bigint[];
  v_deferred_matched_ids bigint[];
  v_deferred_new_ids bigint[];
  v_deferred_x_ids bigint[];
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;
  perform 1 from public.customer_sheet_import_batches where id = p_batch_id for update;
  if not found then raise exception 'IMPORT_BATCH_NOT_FOUND'; end if;

  select coalesce(array_agg(id), '{}'::bigint[]) into v_target_ids from (
    select id from public.customer_sheet_import_rows
    where batch_id = p_batch_id and review_status = 'new_customer'
    order by source_row_number, id limit greatest(1, least(coalesce(p_limit, 200), 200)) for update
  ) targets;
  if cardinality(v_target_ids) = 0 then return query select 0, 0, 0; return; end if;

  select coalesce(array_agg(id), '{}'::bigint[]) into v_unknown_ids from public.customer_sheet_import_rows
  where id = any(v_target_ids) and coalesce(proposed_changes->>'gender', 'unknown') = 'unknown';
  select coalesce(array_agg(id), '{}'::bigint[]) into v_deferred_matched_ids from public.customer_sheet_import_rows
  where batch_id = p_batch_id and review_status = 'matched';
  select coalesce(array_agg(id), '{}'::bigint[]) into v_deferred_new_ids from public.customer_sheet_import_rows
  where batch_id = p_batch_id and review_status = 'new_customer' and id <> all(v_target_ids);
  select coalesce(array_agg(id), '{}'::bigint[]) into v_deferred_x_ids from public.customer_sheet_import_rows
  where batch_id = p_batch_id and review_status = 'x_transfer';

  update public.customer_sheet_import_rows set applied_from_status = review_status, applied_from_selected_customer_id = selected_customer_id
  where id = any(v_target_ids);
  update public.customer_sheet_import_rows set review_status = 'pending' where id = any(v_deferred_matched_ids);
  update public.customer_sheet_import_rows set review_status = 'pending' where id = any(v_deferred_new_ids);
  update public.customer_sheet_import_rows set review_status = 'pending' where id = any(v_deferred_x_ids);

  -- 기존 함수의 성별 검증을 통과시키기 위한 내부 처리값이며, 아래에서 고객과 원본 행 모두 모름으로 되돌린다.
  update public.customer_sheet_import_rows
  set proposed_changes = jsonb_set(coalesce(proposed_changes, '{}'::jsonb), '{gender}', '"female"'::jsonb)
  where id = any(v_unknown_ids);
  return query select * from public.apply_customer_sheet_import_batch(p_batch_id);
  update public.customers customer set gender = 'unknown'
  from public.customer_sheet_import_rows row
  where row.id = any(v_unknown_ids) and row.review_status = 'applied' and row.selected_customer_id = customer.id;
  update public.customer_sheet_import_rows
  set proposed_changes = jsonb_set(coalesce(proposed_changes, '{}'::jsonb), '{gender}', '"unknown"'::jsonb)
  where id = any(v_unknown_ids);
  update public.customer_sheet_import_rows set review_status = 'matched', updated_at = now()
  where id = any(v_deferred_matched_ids) and review_status = 'pending';
  update public.customer_sheet_import_rows set review_status = 'new_customer', updated_at = now()
  where id = any(v_deferred_new_ids) and review_status = 'pending';
  update public.customer_sheet_import_rows set review_status = 'x_transfer', updated_at = now()
  where id = any(v_deferred_x_ids) and review_status = 'pending';
end;
$$;

revoke all on function public.apply_customer_sheet_import_new_chunk_with_snapshot(uuid, integer) from public, anon;
grant execute on function public.apply_customer_sheet_import_new_chunk_with_snapshot(uuid, integer) to authenticated;
