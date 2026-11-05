-- 삭제 직후 화면이 추측하지 않도록 실제 잔여 스탬프를 함께 반환한다.
-- 기존 RPC의 반환 형식(text[] -> jsonb)이 바뀌므로 명시적으로 재생성한다.
drop function if exists public.cancel_or_delete_log_operation(text);
create or replace function public.cancel_or_delete_log_operation(p_log_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_log public.logs%rowtype;
  coupon_log public.logs%rowtype;
  reverse_stamp_delta integer := 0;
  current_count integer;
  deleted_log_ids text[] := array[p_log_id];
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_action <> 'no-stamp' and p_action !~ '^add-[0-9]+$' then
    raise exception 'INVALID_STAMP_ACTION';
  end if;
  select * into target_log from public.logs where id::text = p_log_id for update;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;

  if nullif(target_log.jsonb->>'refundId', '') is not null
    and exists (select 1 from public.customer_refunds refund where refund.id::text = target_log.jsonb->>'refundId') then
    raise exception 'REFUND_HISTORY_IMMUTABLE';
  end if;
  if exists (
    select 1 from public.customer_refunds refund
    join public.defective_inventory_holds hold on hold.refund_id = refund.id
    where refund.source_log_id = target_log.id and refund.status = 'completed'
      and (hold.status <> 'held' or hold.after_service_id is not null
        or exists (select 1 from public.supplier_refund_settlements settlement where settlement.defective_hold_id = hold.id))
  ) then raise exception 'REFUND_FOLLOW_UP_ALREADY_PROCESSED'; end if;
  if exists (select 1 from public.customer_refunds refund where refund.source_log_id = target_log.id and refund.status = 'completed') then
    raise exception 'REFUND_ALREADY_EXISTS';
  end if;

  for coupon_log in select * from public.logs where customer_id = target_log.customer_id and action ~ '^coupon-[0-9]+$' and jsonb->>'couponSourceOutboundLogId' = target_log.id::text for update loop
    update public.stamps set count = count + split_part(coupon_log.action, '-', 2)::integer where customer_id = target_log.customer_id;
    delete from public.logs where id = coupon_log.id;
    deleted_log_ids := array_append(deleted_log_ids, coupon_log.id::text);
  end loop;
  -- 출고 메모로 생성된 고객 특이사항도 원출고와 함께 삭제한다.
  for coupon_log in select * from public.logs where customer_id = target_log.customer_id and jsonb->>'outboundMemoSourceLogId' = target_log.id::text for update loop
    delete from public.logs where id = coupon_log.id;
    deleted_log_ids := array_append(deleted_log_ids, coupon_log.id::text);
  end loop;
  if target_log.category = 'stamp' then
    if target_log.action ~ '^add-[0-9]+$' then reverse_stamp_delta := -split_part(target_log.action, '-', 2)::integer;
    elsif target_log.action ~ '^(remove|coupon)-[0-9]+$' then reverse_stamp_delta := split_part(target_log.action, '-', 2)::integer;
    end if;
  end if;
  if reverse_stamp_delta <> 0 then
    select count into current_count from public.stamps where customer_id = target_log.customer_id for update;
    if not found then raise exception 'STAMP_NOT_FOUND'; end if;
    if current_count + reverse_stamp_delta < 0 then raise exception 'INSUFFICIENT_STAMPS_TO_CANCEL'; end if;
    update public.stamps set count = count + reverse_stamp_delta where customer_id = target_log.customer_id;
  end if;
  delete from public.logs where id = target_log.id;
  select count into current_count from public.stamps where customer_id = target_log.customer_id;
  return jsonb_build_object('deletedLogIds', deleted_log_ids, 'stampCount', current_count);
end $$;

-- 일반 출고 이력의 적립 수량 수정은 이력 action과 총 스탬프를 한 트랜잭션으로 바꾼다.
create or replace function public.update_stamp_log_action(p_log_id text, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_log public.logs%rowtype;
  current_count integer;
  previous_amount integer := 0;
  next_amount integer := 0;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  select * into target_log from public.logs where id::text = p_log_id for update;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;
  if target_log.category <> 'stamp' then raise exception 'STAMP_LOG_REQUIRED'; end if;
  if target_log.action ~ '^add-[0-9]+$' then previous_amount := split_part(target_log.action, '-', 2)::integer; end if;
  if p_action ~ '^add-[0-9]+$' then next_amount := split_part(p_action, '-', 2)::integer; end if;

  select count into current_count from public.stamps where customer_id = target_log.customer_id for update;
  if not found then raise exception 'STAMP_NOT_FOUND'; end if;
  if current_count + next_amount - previous_amount < 0 then raise exception 'INSUFFICIENT_STAMPS'; end if;
  update public.stamps set count = count + next_amount - previous_amount where customer_id = target_log.customer_id;
  update public.logs set action = p_action where id = target_log.id;
  return jsonb_build_object('action', p_action, 'stampCount', current_count + next_amount - previous_amount);
end $$;

revoke all on function public.cancel_or_delete_log_operation(text) from public, anon;
grant execute on function public.cancel_or_delete_log_operation(text) to authenticated;
revoke all on function public.update_stamp_log_action(text, text) from public, anon;
grant execute on function public.update_stamp_log_action(text, text) to authenticated;
