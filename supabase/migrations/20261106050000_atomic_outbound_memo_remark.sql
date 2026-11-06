create or replace function public.update_outbound_memo_remark(
  p_customer_id bigint,
  p_source_log_id text,
  p_source_jsonb jsonb,
  p_remark_note text,
  p_remark_jsonb jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_source_id uuid;
  v_remark_id uuid;
begin
  if not exists (select 1 from public.users where id = auth.uid() and oss_role in ('staff', 'admin', 'master')) then
    raise exception 'LOG_UPDATE_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  select id into v_source_id from public.logs
  where id::text = p_source_log_id and customer_id = p_customer_id for update;
  if v_source_id is null then raise exception 'OUTBOUND_LOG_NOT_FOUND'; end if;
  update public.logs set jsonb = p_source_jsonb where id = v_source_id;
  select id into v_remark_id from public.logs
  where customer_id = p_customer_id and jsonb @> jsonb_build_object('outboundMemoSourceLogId', p_source_log_id)
  order by created_at desc limit 1 for update;
  if nullif(btrim(coalesce(p_remark_note, '')), '') is null then
    if v_remark_id is not null then delete from public.logs where id = v_remark_id; end if;
  elsif v_remark_id is not null then
    update public.logs set note = p_remark_note where id = v_remark_id;
  else
    insert into public.logs (admin_id, customer_id, category, action, note, jsonb)
    values (auth.uid(), p_customer_id, 'stamp', 'no-stamp', p_remark_note, p_remark_jsonb);
  end if;
end;
$$;
revoke all on function public.update_outbound_memo_remark(bigint, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.update_outbound_memo_remark(bigint, text, jsonb, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
