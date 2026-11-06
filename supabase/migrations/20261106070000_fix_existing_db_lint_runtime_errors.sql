-- DB lint 결과 중 실제 실행 오류가 되는 두 함수를 보완한다.
-- 임시 테이블을 함수 안에서 생성하는 품목·재고 함수의 3건은 정적 분석 오탐으로
-- 실제 동작을 바꾸지 않는다.

create or replace function public.update_outbound_memo_remark(
  p_customer_id bigint, p_source_log_id text, p_source_jsonb jsonb,
  p_remark_note text, p_remark_jsonb jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_source_id bigint;
  v_remark_id bigint;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('staff', 'admin', 'master')) then
    raise exception 'LOG_UPDATE_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  select id into v_source_id from public.logs
  where id::text = p_source_log_id and customer_id = p_customer_id for update;
  if v_source_id is null then raise exception 'OUTBOUND_LOG_NOT_FOUND'; end if;
  update public.logs set jsonb = p_source_jsonb where id = v_source_id;
  select id into v_remark_id from public.logs
  where customer_id = p_customer_id and jsonb @> jsonb_build_object('outboundMemoSourceLogId', p_source_log_id)
  order by created_at desc limit 1 for update;
  if nullif(btrim(coalesce(p_remark_note, '')), '') is null then
    if v_remark_id is not null then delete from public.logs where id = v_remark_id; end if;
  elsif v_remark_id is not null then
    update public.logs set note = p_remark_note where id = v_remark_id;
  else
    insert into public.logs (admin_id, customer_id, category, action, note, jsonb)
    values (auth.uid(), p_customer_id, 'stamp', 'no-stamp', p_remark_note, p_remark_jsonb);
  end if;
end;
$$;

create or replace function public.master_update_log_metadata(
  p_log_id text, p_customer_id bigint, p_created_at timestamptz, p_worker_name text
) returns table (id text, customer_id text, created_at timestamptz, updated_at timestamptz, jsonb jsonb)
language plpgsql security definer set search_path = public as $$
declare
  v_log public.logs%rowtype;
  v_stamp_delta integer := 0;
  v_source_stamp_count integer;
  v_next_jsonb jsonb;
begin
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  if nullif(btrim(p_worker_name), '') is null or p_created_at is null then raise exception 'INVALID_HISTORY_METADATA'; end if;
  if not exists (select 1 from public.customers where customers.id = p_customer_id) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  select * into v_log from public.logs where logs.id::text = p_log_id for update;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;
  if v_log.after_service_id is not null then raise exception 'AFTER_SERVICE_LOG_CUSTOMER_IMMUTABLE'; end if;
  if v_log.category = 'stamp' and v_log.customer_id is distinct from p_customer_id then
    if v_log.action ~ '^add-[0-9]+$' then v_stamp_delta := substring(v_log.action from '^add-([0-9]+)$')::integer;
    elsif v_log.action ~ '^remove-[0-9]+$' then v_stamp_delta := -substring(v_log.action from '^remove-([0-9]+)$')::integer; end if;
    if v_stamp_delta <> 0 then
      select count into v_source_stamp_count from public.stamps where stamps.customer_id = v_log.customer_id for update;
      if coalesce(v_source_stamp_count, 0) - v_stamp_delta < 0 then raise exception 'SOURCE_STAMP_BALANCE_INSUFFICIENT'; end if;
      update public.stamps set count = count - v_stamp_delta where stamps.customer_id = v_log.customer_id;
      -- stamps.customer_id에는 고유 제약이 없으므로 ON CONFLICT 대신 기존 행을
      -- 먼저 갱신하고, 없을 때만 새 행을 만든다.
      perform pg_advisory_xact_lock(p_customer_id);
      update public.stamps set count = count + v_stamp_delta where stamps.customer_id = p_customer_id;
      if not found then insert into public.stamps(customer_id, count) values(p_customer_id, v_stamp_delta); end if;
    end if;
  end if;
  v_next_jsonb := coalesce(v_log.jsonb, '{}'::jsonb) || jsonb_build_object(
    'createdWorkerName', btrim(p_worker_name),
    'masterHistoryEdits', coalesce(v_log.jsonb->'masterHistoryEdits', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'editedAt', now(), 'editedBy', auth.uid(), 'previousCustomerId', v_log.customer_id,
      'previousCreatedAt', v_log.created_at, 'previousWorkerName', coalesce(v_log.jsonb->>'createdWorkerName', '')
    ))
  );
  update public.logs set customer_id = p_customer_id, created_at = p_created_at, jsonb = v_next_jsonb
  where logs.id = v_log.id
  returning logs.id::text, logs.customer_id::text, logs.created_at, logs.updated_at, logs.jsonb
  into id, customer_id, created_at, updated_at, jsonb;
  return next;
end;
$$;

revoke all on function public.update_outbound_memo_remark(bigint, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.update_outbound_memo_remark(bigint, text, jsonb, text, jsonb) to authenticated;
revoke all on function public.master_update_log_metadata(text, bigint, timestamptz, text) from public, anon;
grant execute on function public.master_update_log_metadata(text, bigint, timestamptz, text) to authenticated;
notify pgrst, 'reload schema';
