drop function if exists public.apply_stamp_log_operation_v2(bigint, integer, text, text, jsonb);

create function public.apply_stamp_log_operation_v2(
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
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin', 'master')
  ) then
    raise exception 'STAFF_REQUIRED';
  end if;

  if v_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('log-request:' || v_request_id, 0));
    select id into v_log_id from public.logs where jsonb->>'clientRequestId' = v_request_id;
    if found then return v_log_id; end if;
  end if;

  select count into current_count from public.stamps where customer_id = p_customer_id for update;
  if not found then
    if p_stamp_delta < 0 then raise exception 'STAMP_NOT_FOUND'; end if;
    insert into public.stamps(customer_id, count) values(p_customer_id, p_stamp_delta);
  elsif current_count + p_stamp_delta < 0 then
    raise exception 'INSUFFICIENT_STAMPS';
  else
    update public.stamps set count = count + p_stamp_delta where customer_id = p_customer_id;
  end if;

  insert into public.logs(admin_id, customer_id, action, note, jsonb, category, after_service_id)
  values (auth.uid(), p_customer_id, p_action, coalesce(p_note, ''), coalesce(p_jsonb, '{}'::jsonb), 'stamp', v_after_service_id)
  returning id into v_log_id;
  return v_log_id;
end $$;

revoke all on function public.apply_stamp_log_operation_v2(bigint, integer, text, text, jsonb) from public, anon;
grant execute on function public.apply_stamp_log_operation_v2(bigint, integer, text, text, jsonb) to authenticated;

create or replace function public.cancel_or_delete_log_operation(p_log_id text) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  target_log public.logs%rowtype;
  coupon_log public.logs%rowtype;
  reverse_stamp_delta integer := 0;
  current_count integer;
  deleted_log_ids text[] := array[p_log_id];
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('admin', 'master')
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into target_log from public.logs where id::text = p_log_id for update;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;

  for coupon_log in
    select * from public.logs
    where customer_id = target_log.customer_id
      and action ~ '^coupon-[0-9]+$'
      and jsonb->>'couponSourceOutboundLogId' = target_log.id::text
    for update
  loop
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

revoke all on function public.cancel_or_delete_log_operation(text) from public, anon;
grant execute on function public.cancel_or_delete_log_operation(text) to authenticated;
