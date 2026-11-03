-- 출고 이력과 쿠폰 사용을 한 트랜잭션에서 기록해 한쪽만 저장되는 상태를 막는다.
create or replace function public.apply_stamp_log_operation_v2(
  p_customer_id bigint,
  p_stamp_delta integer,
  p_action text,
  p_note text,
  p_jsonb jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  current_count integer;
  v_log_id bigint;
  v_request_id text := nullif(p_jsonb->>'clientRequestId', '');
  v_after_service_id bigint := nullif(p_jsonb->>'afterServiceId', '')::bigint;
  v_coupon_quantity integer := coalesce(nullif(p_jsonb->'couponUse'->>'quantity', '')::integer, 0);
  v_coupon_delta integer;
  v_total_delta integer;
  v_coupon_note text;
  v_coupon_jsonb jsonb;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin', 'master')
  ) then
    raise exception 'STAFF_REQUIRED';
  end if;

  if v_coupon_quantity < 0 then raise exception 'INVALID_COUPON_QUANTITY'; end if;
  v_coupon_delta := v_coupon_quantity * 10;
  v_total_delta := p_stamp_delta - v_coupon_delta;

  if v_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('log-request:' || v_request_id, 0));
    select id into v_log_id from public.logs where jsonb->>'clientRequestId' = v_request_id;
    if found then return v_log_id; end if;
  end if;

  if v_total_delta <> 0 then
    select count into current_count from public.stamps where customer_id = p_customer_id for update;
    if not found then
      if v_total_delta < 0 then raise exception 'INSUFFICIENT_STAMPS'; end if;
      insert into public.stamps(customer_id, count) values(p_customer_id, v_total_delta);
    elsif current_count + v_total_delta < 0 then
      raise exception 'INSUFFICIENT_STAMPS';
    else
      update public.stamps set count = count + v_total_delta where customer_id = p_customer_id;
    end if;
  end if;

  insert into public.logs(admin_id, customer_id, action, note, jsonb, category, after_service_id)
  values (auth.uid(), p_customer_id, p_action, coalesce(p_note, ''), coalesce(p_jsonb, '{}'::jsonb), 'stamp', v_after_service_id)
  returning id into v_log_id;

  if v_coupon_delta > 0 then
    v_coupon_note := format(
      '%s 쿠폰 %s장 사용',
      case p_jsonb->'couponUse'->>'breathType'
        when 'mtl' then '입호흡'
        when 'dtl' then '폐호흡'
        else coalesce(nullif(btrim(p_jsonb->'couponUse'->>'customMemo'), ''), '직접 입력')
      end,
      v_coupon_quantity
    );
    v_coupon_jsonb := (coalesce(p_jsonb, '{}'::jsonb) - 'clientRequestId') || jsonb_build_object('couponSourceOutboundLogId', v_log_id::text);
    insert into public.logs(admin_id, customer_id, action, note, jsonb, category)
    values (auth.uid(), p_customer_id, format('coupon-%s', v_coupon_delta), v_coupon_note, v_coupon_jsonb, 'stamp');
  end if;

  return v_log_id;
end $$;

create or replace function public.confirm_reservation_stamp_operation_v2(
  p_log_id text,
  p_confirmed_worker_name text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  target_log public.logs%rowtype;
  stamp_amount integer := 0;
  current_count integer;
  v_confirmed_at timestamptz := now();
  v_reservation_worker_name text;
  v_confirmed_worker_name text;
  v_coupon_quantity integer := 0;
  v_coupon_delta integer := 0;
  v_total_delta integer;
  v_coupon_note text;
  v_coupon_jsonb jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into target_log from public.logs where id::text=p_log_id for update;
  if not found or target_log.category<>'reservation' then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if target_log.action ~ '^add-[0-9]+$' then stamp_amount:=split_part(target_log.action,'-',2)::integer; end if;
  v_coupon_quantity := coalesce(nullif(target_log.jsonb->'couponUse'->>'quantity', '')::integer, 0);
  if v_coupon_quantity < 0 then raise exception 'INVALID_COUPON_QUANTITY'; end if;
  v_coupon_delta := v_coupon_quantity * 10;
  v_total_delta := stamp_amount - v_coupon_delta;
  v_reservation_worker_name:=nullif(btrim(coalesce(target_log.jsonb->>'createdWorkerName','')),'');
  if v_reservation_worker_name is null then
    select case when oss_role='master' then '마스터' when oss_role='admin' then '관리자' else coalesce(nullif(btrim(name),''),nullif(btrim(email),''),'알 수 없음') end
      into v_reservation_worker_name from public.users where id=target_log.admin_id;
  end if;
  v_confirmed_worker_name:=nullif(btrim(coalesce(p_confirmed_worker_name,'')),'');
  if v_confirmed_worker_name is null then
    select case when oss_role='master' then '마스터' when oss_role='admin' then '관리자' else coalesce(nullif(btrim(name),''),nullif(btrim(email),''),'알 수 없음') end
      into v_confirmed_worker_name from public.users where id=auth.uid();
  end if;

  update public.logs set category='stamp',admin_id=auth.uid(),created_at=v_confirmed_at,updated_at=v_confirmed_at,
    jsonb=coalesce(target_log.jsonb,'{}'::jsonb)||jsonb_build_object(
      'reservationCreatedWorkerName',coalesce(v_reservation_worker_name,'알 수 없음'),
      'reservationCreatedAt',target_log.created_at,
      'confirmedWorkerName',coalesce(v_confirmed_worker_name,'알 수 없음'),
      'confirmedAt',v_confirmed_at
    ) where id=target_log.id and category='reservation';
  if not found then raise exception 'RESERVATION_CONFIRMATION_FAILED'; end if;

  if v_total_delta <> 0 then
    select count into current_count from public.stamps where customer_id=target_log.customer_id for update;
    if not found then
      if v_total_delta < 0 then raise exception 'INSUFFICIENT_STAMPS'; end if;
      insert into public.stamps(customer_id,count) values(target_log.customer_id,v_total_delta);
    elsif current_count + v_total_delta < 0 then
      raise exception 'INSUFFICIENT_STAMPS';
    else
      update public.stamps set count=count+v_total_delta where customer_id=target_log.customer_id;
    end if;
  end if;

  if v_coupon_delta > 0 then
    v_coupon_note := format(
      '%s 쿠폰 %s장 사용',
      case target_log.jsonb->'couponUse'->>'breathType'
        when 'mtl' then '입호흡'
        when 'dtl' then '폐호흡'
        else coalesce(nullif(btrim(target_log.jsonb->'couponUse'->>'customMemo'), ''), '직접 입력')
      end,
      v_coupon_quantity
    );
    v_coupon_jsonb := (coalesce(target_log.jsonb, '{}'::jsonb) - 'clientRequestId') || jsonb_build_object('couponSourceOutboundLogId', target_log.id::text);
    insert into public.logs(admin_id, customer_id, action, note, jsonb, category)
    values (auth.uid(), target_log.customer_id, format('coupon-%s', v_coupon_delta), v_coupon_note, v_coupon_jsonb, 'stamp');
  end if;
end $$;

-- 새 DB 함수가 먼저 배포된 뒤 이전 프런트가 쿠폰 차감을 다시 요청해도,
-- 연결된 쿠폰 이력이 이미 있으면 중복 차감하지 않는다.
create or replace function public.apply_stamp_log_operation(
  p_customer_id bigint,
  p_stamp_delta integer,
  p_action text,
  p_note text,
  p_jsonb jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  current_count integer;
  v_request_id text := nullif(p_jsonb->>'clientRequestId', '');
  v_after_service_id bigint := nullif(p_jsonb->>'afterServiceId', '')::bigint;
  v_coupon_source_outbound_log_id text := nullif(p_jsonb->>'couponSourceOutboundLogId', '');
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  if p_action ~ '^coupon-[0-9]+$' and v_coupon_source_outbound_log_id is not null and exists (
    select 1 from public.logs
    where customer_id = p_customer_id
      and action ~ '^coupon-[0-9]+$'
      and jsonb->>'couponSourceOutboundLogId' = v_coupon_source_outbound_log_id
  ) then
    return;
  end if;

  if v_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('log-request:' || v_request_id, 0));
    if exists (select 1 from public.logs where jsonb->>'clientRequestId' = v_request_id) then return; end if;
  end if;

  select stamps.count into current_count from public.stamps where customer_id = p_customer_id for update;
  if not found then
    if p_stamp_delta < 0 then raise exception 'STAMP_NOT_FOUND'; end if;
    insert into public.stamps(customer_id, count) values(p_customer_id, p_stamp_delta);
  elsif current_count + p_stamp_delta < 0 then
    raise exception 'INSUFFICIENT_STAMPS';
  else
    update public.stamps set count = count + p_stamp_delta where customer_id = p_customer_id;
  end if;

  insert into public.logs(admin_id, customer_id, action, note, jsonb, category, after_service_id)
  values (auth.uid(), p_customer_id, p_action, coalesce(p_note, ''), coalesce(p_jsonb, '{}'::jsonb), 'stamp', v_after_service_id);
end $$;

revoke all on function public.apply_stamp_log_operation_v2(bigint,integer,text,text,jsonb) from public,anon;
grant execute on function public.apply_stamp_log_operation_v2(bigint,integer,text,text,jsonb) to authenticated;
revoke all on function public.apply_stamp_log_operation(bigint,integer,text,text,jsonb) from public,anon;
grant execute on function public.apply_stamp_log_operation(bigint,integer,text,text,jsonb) to authenticated;
revoke all on function public.confirm_reservation_stamp_operation_v2(text,text) from public,anon;
grant execute on function public.confirm_reservation_stamp_operation_v2(text,text) to authenticated;

-- 자동 보정 없이 기존 누락 의심 건을 확인한다.
-- couponUse 메타데이터가 있으나 연결된 쿠폰 로그가 없는 출고만 반환한다.
create or replace view public.outbound_coupon_usage_gaps as
select outbound.id as outbound_log_id, outbound.customer_id, outbound.created_at, outbound.note, outbound.jsonb->'couponUse' as coupon_use
from public.logs outbound
where outbound.category = 'stamp'
  and outbound.jsonb ? 'couponUse'
  and not exists (
    select 1 from public.logs coupon
    where coupon.customer_id = outbound.customer_id
      and coupon.action ~ '^coupon-[0-9]+$'
      and coupon.jsonb->>'couponSourceOutboundLogId' = outbound.id::text
  );

revoke all on public.outbound_coupon_usage_gaps from public, anon;
grant select on public.outbound_coupon_usage_gaps to authenticated;
