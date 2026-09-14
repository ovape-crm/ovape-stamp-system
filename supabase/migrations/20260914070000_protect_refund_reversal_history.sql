-- 환불과 그 취소 상계 이력은 한 쌍의 감사·정산 기록이므로 개별 삭제를 막는다.
create or replace function public.cancel_or_delete_log_operation(p_log_id text)
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
