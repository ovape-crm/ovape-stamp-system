-- 배포 전 기존 화면도 삭제 RPC를 배열로 받을 수 있도록 이전 반환 형식을 복구한다.
drop function if exists public.cancel_or_delete_log_operation(text);
create function public.cancel_or_delete_log_operation(p_log_id text)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  target_log public.logs%rowtype;
  coupon_log public.logs%rowtype;
  reverse_stamp_delta integer := 0;
  current_count integer;
  deleted_log_ids text[] := array[p_log_id];
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('admin', 'master')) then raise exception 'ADMIN_REQUIRED'; end if;
  select * into target_log from public.logs where id::text = p_log_id for update;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;
  if nullif(target_log.jsonb->>'refundId', '') is not null and exists (select 1 from public.customer_refunds refund where refund.id::text = target_log.jsonb->>'refundId') then raise exception 'REFUND_HISTORY_IMMUTABLE'; end if;
  if exists (select 1 from public.customer_refunds refund join public.defective_inventory_holds hold on hold.refund_id = refund.id where refund.source_log_id = target_log.id and refund.status = 'completed' and (hold.status <> 'held' or hold.after_service_id is not null or exists (select 1 from public.supplier_refund_settlements settlement where settlement.defective_hold_id = hold.id))) then raise exception 'REFUND_FOLLOW_UP_ALREADY_PROCESSED'; end if;
  if exists (select 1 from public.customer_refunds refund where refund.source_log_id = target_log.id and refund.status = 'completed') then raise exception 'REFUND_ALREADY_EXISTS'; end if;

  for coupon_log in select * from public.logs where customer_id = target_log.customer_id and action ~ '^coupon-[0-9]+$' and jsonb->>'couponSourceOutboundLogId' = target_log.id::text for update loop
    update public.stamps set count = count + split_part(coupon_log.action, '-', 2)::integer where customer_id = target_log.customer_id;
    delete from public.logs where id = coupon_log.id;
    deleted_log_ids := array_append(deleted_log_ids, coupon_log.id::text);
  end loop;
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
  return deleted_log_ids;
end $$;

-- 새 화면은 삭제 결과와 최종 스탬프를 함께 받아 즉시 화면에 반영한다.
create or replace function public.cancel_or_delete_log_operation_with_stamp_count(p_log_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_customer_id bigint;
  deleted_log_ids text[];
  current_count integer;
begin
  select customer_id into target_customer_id from public.logs where id::text = p_log_id;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;
  deleted_log_ids := public.cancel_or_delete_log_operation(p_log_id);
  select count into current_count from public.stamps where customer_id = target_customer_id;
  return jsonb_build_object('deletedLogIds', deleted_log_ids, 'stampCount', current_count);
end $$;

revoke all on function public.cancel_or_delete_log_operation(text) from public, anon;
grant execute on function public.cancel_or_delete_log_operation(text) to authenticated;
revoke all on function public.cancel_or_delete_log_operation_with_stamp_count(text) from public, anon;
grant execute on function public.cancel_or_delete_log_operation_with_stamp_count(text) to authenticated;
