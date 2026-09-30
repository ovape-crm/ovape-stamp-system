-- 대량 시트 반영은 API 시간 제한을 피하도록 연결 후보만 제한된 단위로 처리한다.
create or replace function public.apply_customer_sheet_import_matched_chunk_with_snapshot(
  p_batch_id uuid,
  p_limit integer default 200
)
returns table(applied_rows integer, duplicate_rows integer, held_rows integer)
language plpgsql security definer set search_path = public as $$
declare
  v_target_ids bigint[];
  v_deferred_ids bigint[];
  v_deferred_new_ids bigint[];
  v_deferred_x_ids bigint[];
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;
  perform 1 from public.customer_sheet_import_batches where id = p_batch_id for update;
  if not found then raise exception 'IMPORT_BATCH_NOT_FOUND'; end if;

  select coalesce(array_agg(id), '{}'::bigint[]) into v_target_ids
  from (
    select id
    from public.customer_sheet_import_rows
    where batch_id = p_batch_id and review_status = 'matched'
    order by source_row_number, id
    limit greatest(1, least(coalesce(p_limit, 200), 200))
    for update
  ) targets;
  if cardinality(v_target_ids) = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  select coalesce(array_agg(id), '{}'::bigint[]) into v_deferred_ids
  from public.customer_sheet_import_rows
  where batch_id = p_batch_id and review_status = 'matched' and id <> all(v_target_ids);
  select coalesce(array_agg(id), '{}'::bigint[]) into v_deferred_new_ids
  from public.customer_sheet_import_rows
  where batch_id = p_batch_id and review_status = 'new_customer';
  select coalesce(array_agg(id), '{}'::bigint[]) into v_deferred_x_ids
  from public.customer_sheet_import_rows
  where batch_id = p_batch_id and review_status = 'x_transfer';

  update public.customer_sheet_import_rows
  set applied_from_status = review_status,
      applied_from_selected_customer_id = selected_customer_id
  where id = any(v_target_ids);

  -- 기존 일괄 함수는 eligible 상태 전체를 처리하므로, 이번 단위 밖의 연결 후보만 잠시 제외한다.
  update public.customer_sheet_import_rows set review_status = 'pending'
  where id = any(v_deferred_ids);
  update public.customer_sheet_import_rows set review_status = 'pending'
  where id = any(v_deferred_new_ids);
  update public.customer_sheet_import_rows set review_status = 'pending'
  where id = any(v_deferred_x_ids);

  return query select * from public.apply_customer_sheet_import_batch(p_batch_id);

  update public.customer_sheet_import_rows set review_status = 'matched', updated_at = now()
  where id = any(v_deferred_ids) and review_status = 'pending';
  update public.customer_sheet_import_rows set review_status = 'new_customer', updated_at = now()
  where id = any(v_deferred_new_ids) and review_status = 'pending';
  update public.customer_sheet_import_rows set review_status = 'x_transfer', updated_at = now()
  where id = any(v_deferred_x_ids) and review_status = 'pending';
end;
$$;

revoke all on function public.apply_customer_sheet_import_matched_chunk_with_snapshot(uuid, integer) from public, anon;
grant execute on function public.apply_customer_sheet_import_matched_chunk_with_snapshot(uuid, integer) to authenticated;
