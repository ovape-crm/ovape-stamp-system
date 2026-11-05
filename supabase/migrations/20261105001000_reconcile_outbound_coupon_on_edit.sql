-- 출고 이력 수정에서 쿠폰 사용을 취소할 때, 출고 로그와 연결된 쿠폰 차감 이력을
-- 한 트랜잭션으로 함께 되돌린다.
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
  current_count integer;
  previous_amount integer := 0;
  next_amount integer := 0;
  coupon_restore_delta integer := 0;
  total_delta integer := 0;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into target_log
  from public.logs
  where id::text = p_log_id
  for update;

  if not found then raise exception 'LOG_NOT_FOUND'; end if;
  if target_log.category <> 'stamp' then raise exception 'STAMP_LOG_REQUIRED'; end if;

  if target_log.action ~ '^add-[0-9]+$' then
    previous_amount := split_part(target_log.action, '-', 2)::integer;
  end if;
  if p_action ~ '^add-[0-9]+$' then
    next_amount := split_part(p_action, '-', 2)::integer;
  end if;

  -- 기존 쿠폰 사용이 제거된 경우에만, 이 출고에 연결된 쿠폰 이력을 되돌린다.
  if coalesce(target_log.jsonb, '{}'::jsonb) ? 'couponUse'
    and not (coalesce(p_jsonb, '{}'::jsonb) ? 'couponUse') then
    for coupon_log in
      select * from public.logs
      where customer_id = target_log.customer_id
        and action ~ '^coupon-[0-9]+$'
        and jsonb->>'couponSourceOutboundLogId' = target_log.id::text
      for update
    loop
      coupon_restore_delta := coupon_restore_delta
        + split_part(coupon_log.action, '-', 2)::integer;
    end loop;
  end if;

  total_delta := next_amount - previous_amount + coupon_restore_delta;
  if total_delta <> 0 then
    select count into current_count
    from public.stamps
    where customer_id = target_log.customer_id
    for update;

    if not found then raise exception 'STAMP_NOT_FOUND'; end if;
    if current_count + total_delta < 0 then raise exception 'INSUFFICIENT_STAMPS'; end if;

    update public.stamps
    set count = count + total_delta
    where customer_id = target_log.customer_id;
  else
    select count into current_count
    from public.stamps
    where customer_id = target_log.customer_id;
  end if;

  if coupon_restore_delta > 0 then
    delete from public.logs
    where customer_id = target_log.customer_id
      and action ~ '^coupon-[0-9]+$'
      and jsonb->>'couponSourceOutboundLogId' = target_log.id::text;
  end if;

  update public.logs
  set note = p_note,
      jsonb = coalesce(p_jsonb, '{}'::jsonb),
      action = p_action
  where id = target_log.id
  returning * into updated_log;

  select count into current_count
  from public.stamps
  where customer_id = target_log.customer_id;

  return jsonb_build_object(
    'log', to_jsonb(updated_log),
    'stampCount', current_count
  );
end $$;

revoke all on function public.update_outbound_log_with_coupon_reconciliation(text, text, jsonb, text) from public, anon;
grant execute on function public.update_outbound_log_with_coupon_reconciliation(text, text, jsonb, text) to authenticated;
