-- 직원 출고 수정도 쿠폰·적립·로그를 한 트랜잭션에서 함께 갱신한다.
-- 기존 함수는 관리자만 허용해, 직원 계정에서 로그 본문만 먼저 저장된 뒤
-- 스탬프 갱신이 실패하는 부분 저장 상태를 만들 수 있었다.
create or replace function public.update_outbound_log_with_coupon_reconciliation(
  p_log_id text,
  p_note text,
  p_jsonb jsonb,
  p_action text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  target_log public.logs%rowtype;
  updated_log public.logs%rowtype;
  coupon_log public.logs%rowtype;
  primary_coupon_log_id bigint := null;
  current_count integer;
  previous_amount integer := 0;
  next_amount integer := 0;
  existing_coupon_delta integer := 0;
  next_coupon_delta integer := coalesce(nullif(p_jsonb->'couponUse'->>'quantity', '')::integer, 0) * 10;
  total_delta integer := 0;
  next_coupon_note text;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin', 'master')
  ) then
    raise exception 'STAFF_REQUIRED';
  end if;

  if next_coupon_delta < 0 then raise exception 'INVALID_COUPON_QUANTITY'; end if;

  select * into target_log from public.logs where id::text = p_log_id for update;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;
  if target_log.category <> 'stamp' then raise exception 'STAMP_LOG_REQUIRED'; end if;

  if target_log.action ~ '^add-[0-9]+$' then
    previous_amount := split_part(target_log.action, '-', 2)::integer;
  end if;
  if p_action ~ '^add-[0-9]+$' then
    next_amount := split_part(p_action, '-', 2)::integer;
  end if;

  for coupon_log in
    select * from public.logs
    where customer_id = target_log.customer_id
      and action ~ '^coupon-[0-9]+$'
      and jsonb->>'couponSourceOutboundLogId' = target_log.id::text
    order by created_at, id for update
  loop
    existing_coupon_delta := existing_coupon_delta + split_part(coupon_log.action, '-', 2)::integer;
    if primary_coupon_log_id is null then primary_coupon_log_id := coupon_log.id; end if;
  end loop;

  total_delta := next_amount - previous_amount + existing_coupon_delta - next_coupon_delta;
  if total_delta <> 0 then
    select count into current_count from public.stamps where customer_id = target_log.customer_id for update;
    if not found then raise exception 'STAMP_NOT_FOUND'; end if;
    if current_count + total_delta < 0 then raise exception 'INSUFFICIENT_STAMPS'; end if;
    update public.stamps set count = count + total_delta where customer_id = target_log.customer_id;
  end if;

  if next_coupon_delta = 0 then
    delete from public.logs where customer_id = target_log.customer_id
      and action ~ '^coupon-[0-9]+$'
      and jsonb->>'couponSourceOutboundLogId' = target_log.id::text;
  else
    next_coupon_note := format(
      '%s%s 쿠폰 %s장 사용',
      case p_jsonb->'couponUse'->>'breathType'
        when 'mtl' then '입호흡' when 'dtl' then '폐호흡'
        else coalesce(nullif(btrim(p_jsonb->'couponUse'->>'customMemo'), ''), '직접 입력') end,
      case p_jsonb->'couponUse'->>'saleKind'
        when 'event' then ' · 이벤트' when 'basic' then ' · 기본' else '' end,
      next_coupon_delta / 10
    );
    if primary_coupon_log_id is null then
      insert into public.logs(admin_id, customer_id, action, note, jsonb, category)
      values (auth.uid(), target_log.customer_id, format('coupon-%s', next_coupon_delta), next_coupon_note,
        jsonb_strip_nulls(jsonb_build_object('couponSourceOutboundLogId', target_log.id::text, 'createdWorkerName', nullif(p_jsonb->>'createdWorkerName', ''))), 'stamp');
    else
      update public.logs set action = format('coupon-%s', next_coupon_delta), note = next_coupon_note where id = primary_coupon_log_id;
      delete from public.logs where customer_id = target_log.customer_id
        and action ~ '^coupon-[0-9]+$'
        and jsonb->>'couponSourceOutboundLogId' = target_log.id::text and id <> primary_coupon_log_id;
    end if;
  end if;

  update public.logs set note = p_note, jsonb = coalesce(p_jsonb, '{}'::jsonb), action = p_action
  where id = target_log.id returning * into updated_log;
  select count into current_count from public.stamps where customer_id = target_log.customer_id;
  return jsonb_build_object('log', to_jsonb(updated_log), 'stampCount', current_count);
end $$;

revoke all on function public.update_outbound_log_with_coupon_reconciliation(text, text, jsonb, text) from public, anon;
grant execute on function public.update_outbound_log_with_coupon_reconciliation(text, text, jsonb, text) to authenticated;
