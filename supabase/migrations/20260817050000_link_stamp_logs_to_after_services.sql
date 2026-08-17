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
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  if v_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('log-request:' || v_request_id, 0));
    if exists (
      select 1 from public.logs
      where jsonb->>'clientRequestId' = v_request_id
    ) then return; end if;
  end if;

  select stamps.count into current_count
  from public.stamps
  where customer_id = p_customer_id
  for update;

  if not found then
    if p_stamp_delta < 0 then raise exception 'STAMP_NOT_FOUND'; end if;
    insert into public.stamps(customer_id, count)
    values(p_customer_id, p_stamp_delta);
  else
    if current_count + p_stamp_delta < 0 then raise exception 'INSUFFICIENT_STAMPS'; end if;
    update public.stamps
    set count = count + p_stamp_delta
    where customer_id = p_customer_id;
  end if;

  insert into public.logs(
    admin_id,
    customer_id,
    action,
    note,
    jsonb,
    category,
    after_service_id
  )
  values(
    auth.uid(),
    p_customer_id,
    p_action,
    coalesce(p_note, ''),
    coalesce(p_jsonb, '{}'::jsonb),
    'stamp',
    v_after_service_id
  );
end;
$$;

revoke all on function public.apply_stamp_log_operation(bigint,integer,text,text,jsonb) from public,anon;
grant execute on function public.apply_stamp_log_operation(bigint,integer,text,text,jsonb) to authenticated;

create index if not exists logs_after_service_operation_idx
on public.logs(after_service_id, ((jsonb->>'afterServiceOperation')))
where after_service_id is not null;
