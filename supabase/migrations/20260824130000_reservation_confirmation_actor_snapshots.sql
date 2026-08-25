create or replace function public.confirm_reservation_stamp_operation_v2(
  p_log_id text,
  p_confirmed_worker_name text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_log public.logs%rowtype;
  stamp_amount integer := 0;
  current_count integer;
  v_confirmed_at timestamptz := now();
  v_reservation_worker_name text;
  v_confirmed_worker_name text;
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

  v_reservation_worker_name := nullif(
    btrim(coalesce(target_log.jsonb->>'createdWorkerName', '')),
    ''
  );
  if v_reservation_worker_name is null then
    select case
      when oss_role = 'master' then '마스터'
      when oss_role = 'admin' then '관리자'
      else coalesce(nullif(btrim(name), ''), nullif(btrim(email), ''), '알 수 없음')
    end
    into v_reservation_worker_name
    from public.users
    where id = target_log.admin_id;
  end if;

  v_confirmed_worker_name := nullif(btrim(coalesce(p_confirmed_worker_name, '')), '');
  if v_confirmed_worker_name is null then
    select case
      when oss_role = 'master' then '마스터'
      when oss_role = 'admin' then '관리자'
      else coalesce(nullif(btrim(name), ''), nullif(btrim(email), ''), '알 수 없음')
    end
    into v_confirmed_worker_name
    from public.users
    where id = auth.uid();
  end if;

  update public.logs
  set category = 'stamp',
      admin_id = auth.uid(),
      created_at = v_confirmed_at,
      updated_at = v_confirmed_at,
      jsonb = coalesce(target_log.jsonb, '{}'::jsonb) || jsonb_build_object(
        'reservationCreatedWorkerName', coalesce(v_reservation_worker_name, '알 수 없음'),
        'reservationCreatedAt', target_log.created_at,
        'confirmedWorkerName', coalesce(v_confirmed_worker_name, '알 수 없음'),
        'confirmedAt', v_confirmed_at
      )
  where id::text = p_log_id;
end;
$$;

revoke all on function public.confirm_reservation_stamp_operation_v2(text, text) from public, anon;
grant execute on function public.confirm_reservation_stamp_operation_v2(text, text) to authenticated;

notify pgrst, 'reload schema';
