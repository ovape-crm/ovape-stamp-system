-- 출고·스탬프·로그와 설정 저장을 한 트랜잭션으로 처리합니다.

drop function if exists public.apply_stamp_log_operation(uuid,integer,text,text,jsonb);

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
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select count into current_count
  from public.stamps
  where customer_id = p_customer_id
  for update;

  if not found then
    if p_stamp_delta < 0 then raise exception 'STAMP_NOT_FOUND'; end if;
    insert into public.stamps(customer_id, count)
    values(p_customer_id, p_stamp_delta);
  else
    if current_count + p_stamp_delta < 0 then
      raise exception 'INSUFFICIENT_STAMPS';
    end if;
    update public.stamps
    set count = count + p_stamp_delta
    where customer_id = p_customer_id;
  end if;

  insert into public.logs(admin_id, customer_id, action, note, jsonb, category)
  values(
    auth.uid(),
    p_customer_id,
    p_action,
    coalesce(p_note, ''),
    coalesce(p_jsonb, '{}'::jsonb),
    'stamp'
  );
end;
$$;

create or replace function public.confirm_reservation_stamp_operation(
  p_log_id text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target_log public.logs%rowtype;
  stamp_amount integer := 0;
  current_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into target_log
  from public.logs
  where id::text = p_log_id
  for update;

  if not found or target_log.category <> 'reservation' then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if target_log.action ~ '^add-[0-9]+$' then
    stamp_amount := split_part(target_log.action, '-', 2)::integer;
  end if;

  if stamp_amount > 0 then
    select count into current_count
    from public.stamps
    where customer_id = target_log.customer_id
    for update;

    if not found then
      insert into public.stamps(customer_id, count)
      values(target_log.customer_id, stamp_amount);
    else
      update public.stamps
      set count = count + stamp_amount
      where customer_id = target_log.customer_id;
    end if;
  end if;

  update public.logs
  set category = 'stamp', created_at = now()
  where id::text = p_log_id;
end;
$$;

create or replace function public.cancel_or_delete_log_operation(
  p_log_id text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target_log public.logs%rowtype;
  reverse_stamp_delta integer := 0;
  current_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into target_log
  from public.logs
  where id::text = p_log_id
  for update;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;

  if target_log.category = 'stamp' then
    if target_log.action ~ '^add-[0-9]+$' then
      reverse_stamp_delta := -split_part(target_log.action, '-', 2)::integer;
    elsif target_log.action ~ '^(remove|coupon)-[0-9]+$' then
      reverse_stamp_delta := split_part(target_log.action, '-', 2)::integer;
    end if;
  end if;

  if reverse_stamp_delta <> 0 then
    select count into current_count
    from public.stamps
    where customer_id = target_log.customer_id
    for update;
    if not found then raise exception 'STAMP_NOT_FOUND'; end if;
    if current_count + reverse_stamp_delta < 0 then
      raise exception 'INSUFFICIENT_STAMPS_TO_CANCEL';
    end if;
    update public.stamps
    set count = count + reverse_stamp_delta
    where customer_id = target_log.customer_id;
  end if;

  delete from public.logs where id::text = p_log_id;
end;
$$;

create or replace function public.save_daily_closing_checklist_items(
  p_items jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  delete from public.daily_closing_checklist_items
  where phase in ('opening', 'closing');

  insert into public.daily_closing_checklist_items(
    phase, label, sort_order, is_required, is_opening_gate
  )
  select
    item->>'phase',
    btrim(item->>'label'),
    coalesce((item->>'sort_order')::integer, 0),
    coalesce((item->>'is_required')::boolean, false),
    coalesce((item->>'is_opening_gate')::boolean, false)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
  where item->>'phase' in ('opening', 'closing')
    and btrim(coalesce(item->>'label', '')) <> '';
end;
$$;

revoke all on function public.apply_stamp_log_operation(bigint,integer,text,text,jsonb) from public,anon;
revoke all on function public.confirm_reservation_stamp_operation(text) from public,anon;
revoke all on function public.cancel_or_delete_log_operation(text) from public,anon;
revoke all on function public.save_daily_closing_checklist_items(jsonb) from public,anon;
grant execute on function public.apply_stamp_log_operation(bigint,integer,text,text,jsonb) to authenticated;
grant execute on function public.confirm_reservation_stamp_operation(text) to authenticated;
grant execute on function public.cancel_or_delete_log_operation(text) to authenticated;
grant execute on function public.save_daily_closing_checklist_items(jsonb) to authenticated;

create or replace function public.cancel_daily_closing_report(
  p_business_date date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_report public.daily_closing_reports%rowtype;
  v_is_admin boolean;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select exists (
    select 1 from public.users
    where users.id = auth.uid() and users.oss_role = 'admin'
  ) into v_is_admin;
  if not v_is_admin and p_business_date <> v_today then
    raise exception 'CANCEL_NOT_ALLOWED';
  end if;

  select * into v_report
  from public.daily_closing_reports
  where business_date = p_business_date
  for update;
  if not found then raise exception 'CLOSING_REPORT_NOT_FOUND'; end if;

  if v_report.closed_work_journal then
    update public.work_journals
    set end_time = coalesce(expected_end_time, end_time),
        input_work_hours = null,
        status = 'working',
        updated_at = now()
    where work_date = p_business_date;
  else
    update public.work_journals
    set input_work_hours = null, updated_at = now()
    where work_date = p_business_date;
  end if;

  delete from public.daily_closing_reports where id = v_report.id;
end;
$$;

revoke all on function public.cancel_daily_closing_report(date) from public;
grant execute on function public.cancel_daily_closing_report(date) to authenticated;
notify pgrst, 'reload schema';
