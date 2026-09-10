-- 마스터가 개별 고객 이력의 소속, 작업 시각, 작업자를 정정할 수 있도록 한다.
-- 원본 이력은 삭제하지 않으며 이전 값은 logs.jsonb.masterHistoryEdits에 누적한다.

create or replace function public.master_update_log_metadata(
  p_log_id text,
  p_customer_id bigint,
  p_created_at timestamptz,
  p_worker_name text
) returns table (
  id text,
  customer_id text,
  created_at timestamptz,
  updated_at timestamptz,
  jsonb jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.logs%rowtype;
  v_stamp_delta integer := 0;
  v_source_stamp_count integer;
  v_next_jsonb jsonb;
begin
  if not public.is_current_user_master() then
    raise exception 'MASTER_REQUIRED';
  end if;
  if nullif(btrim(p_worker_name), '') is null or p_created_at is null then
    raise exception 'INVALID_HISTORY_METADATA';
  end if;
  if not exists (select 1 from public.customers where customers.id = p_customer_id) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  select * into v_log
  from public.logs
  where logs.id::text = p_log_id
  for update;
  if not found then
    raise exception 'LOG_NOT_FOUND';
  end if;
  if v_log.after_service_id is not null then
    raise exception 'AFTER_SERVICE_LOG_CUSTOMER_IMMUTABLE';
  end if;

  -- 확정 출고 이력의 스탬프 적립분은 고객 이전과 함께 원 고객에서 빼고 새 고객에 더한다.
  if v_log.category = 'stamp' and v_log.customer_id is distinct from p_customer_id then
    if v_log.action ~ '^add-[0-9]+$' then
      v_stamp_delta := substring(v_log.action from '^add-([0-9]+)$')::integer;
    elsif v_log.action ~ '^remove-[0-9]+$' then
      v_stamp_delta := -substring(v_log.action from '^remove-([0-9]+)$')::integer;
    end if;

    if v_stamp_delta <> 0 then
      select count into v_source_stamp_count
      from public.stamps
      where stamps.customer_id = v_log.customer_id
      for update;
      if coalesce(v_source_stamp_count, 0) - v_stamp_delta < 0 then
        raise exception 'SOURCE_STAMP_BALANCE_INSUFFICIENT';
      end if;
      update public.stamps
      set count = count - v_stamp_delta
      where stamps.customer_id = v_log.customer_id;
      insert into public.stamps(customer_id, count)
      values(p_customer_id, v_stamp_delta)
      on conflict (customer_id) do update
      set count = public.stamps.count + excluded.count;
    end if;
  end if;

  v_next_jsonb := coalesce(v_log.jsonb, '{}'::jsonb) || jsonb_build_object(
    'createdWorkerName', btrim(p_worker_name),
    'masterHistoryEdits',
      coalesce(v_log.jsonb->'masterHistoryEdits', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'editedAt', now(),
          'editedBy', auth.uid(),
          'previousCustomerId', v_log.customer_id,
          'previousCreatedAt', v_log.created_at,
          'previousWorkerName', coalesce(v_log.jsonb->>'createdWorkerName', '')
        )
      )
  );

  update public.logs
  set customer_id = p_customer_id,
      created_at = p_created_at,
      jsonb = v_next_jsonb
  where logs.id = v_log.id
  returning logs.id::text, logs.customer_id::text, logs.created_at, logs.updated_at, logs.jsonb
  into id, customer_id, created_at, updated_at, jsonb;

  return next;
end;
$$;

revoke all on function public.master_update_log_metadata(text, bigint, timestamptz, text)
  from public, anon;
grant execute on function public.master_update_log_metadata(text, bigint, timestamptz, text)
  to authenticated;
