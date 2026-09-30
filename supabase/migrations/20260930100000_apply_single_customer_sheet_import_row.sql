-- 한 행만 안전하게 반영할 수 있도록, 기존 일괄 반영 검증 로직을 재사용한다.
create or replace function public.apply_customer_sheet_import_row(p_row_id bigint)
returns table(applied_rows integer, duplicate_rows integer, held_rows integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_status text;
  v_matched_ids bigint[];
  v_new_customer_ids bigint[];
  v_x_transfer_ids bigint[];
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;

  select batch_id, review_status into v_batch_id, v_status
  from public.customer_sheet_import_rows
  where id = p_row_id
  for update;
  if not found then raise exception 'IMPORT_ROW_NOT_FOUND'; end if;
  if v_status not in ('matched', 'new_customer', 'x_transfer') then
    raise exception 'IMPORT_ROW_NOT_READY_TO_APPLY';
  end if;

  -- 일괄 반영 함수가 현재 행만 읽도록 나머지 반영 가능 행을 잠시 제외한다.
  select array_agg(id) filter (where review_status = 'matched'),
         array_agg(id) filter (where review_status = 'new_customer'),
         array_agg(id) filter (where review_status = 'x_transfer')
    into v_matched_ids, v_new_customer_ids, v_x_transfer_ids
  from public.customer_sheet_import_rows
  where batch_id = v_batch_id
    and id <> p_row_id
    and review_status in ('matched', 'new_customer', 'x_transfer');

  update public.customer_sheet_import_rows
  set review_status = 'pending', updated_at = now()
  where id = any(coalesce(v_matched_ids, '{}'::bigint[])
                 || coalesce(v_new_customer_ids, '{}'::bigint[])
                 || coalesce(v_x_transfer_ids, '{}'::bigint[]));

  return query select * from public.apply_customer_sheet_import_batch(v_batch_id);

  update public.customer_sheet_import_rows
  set review_status = 'matched', updated_at = now()
  where id = any(coalesce(v_matched_ids, '{}'::bigint[]));
  update public.customer_sheet_import_rows
  set review_status = 'new_customer', updated_at = now()
  where id = any(coalesce(v_new_customer_ids, '{}'::bigint[]));
  update public.customer_sheet_import_rows
  set review_status = 'x_transfer', updated_at = now()
  where id = any(coalesce(v_x_transfer_ids, '{}'::bigint[]));
end;
$$;

revoke all on function public.apply_customer_sheet_import_row(bigint) from public, anon;
grant execute on function public.apply_customer_sheet_import_row(bigint) to authenticated;
