-- 기존 고객 후보가 전혀 없는 행은 신규 고객 후보로 유지하되, 성별은 추측하지 않는다.
create or replace function public.prepare_customer_sheet_import_unmatched_as_unknown(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_OR_MASTER_REQUIRED';
  end if;

  update public.customer_sheet_import_rows
  set
    review_status = 'new_customer',
    selected_customer_id = null,
    proposed_changes = coalesce(proposed_changes, '{}'::jsonb) || jsonb_build_object('gender', 'unknown'),
    review_note = concat_ws(E'\n', nullif(review_note, ''), '기존 고객 후보 없음: 신규 고객 성별 모름으로 준비'),
    updated_at = now()
  where batch_id = p_batch_id
    and review_status = 'unmatched_identity';

  get diagnostics v_updated = row_count;
  update public.customer_sheet_import_batches set updated_at = now() where id = p_batch_id;
  return v_updated;
end;
$$;

revoke all on function public.prepare_customer_sheet_import_unmatched_as_unknown(uuid) from public, anon;
grant execute on function public.prepare_customer_sheet_import_unmatched_as_unknown(uuid) to authenticated;

-- 신규 고객 반영 시에도 성별 모름 값을 그대로 저장한다.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.apply_customer_sheet_import_batch(uuid)'::regprocedure)
    into v_definition;

  if position('not in (''male'', ''female'')' in v_definition) = 0 then
    raise exception 'UNKNOWN_GENDER_PATCH_TARGET_NOT_FOUND';
  end if;

  v_definition := replace(
    v_definition,
    'not in (''male'', ''female'')',
    'not in (''male'', ''female'', ''unknown'')'
  );
  execute v_definition;
end;
$$;
