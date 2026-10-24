-- Editing a customer exchange inbound/outbound memo must not rewrite the
-- inventory-linked item JSON of the history record.
create or replace function public.update_exchange_history_note(
  p_log_id bigint,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and oss_role in ('staff', 'admin', 'master')
  ) then raise exception 'AUTH_REQUIRED'; end if;

  update public.logs
  set note = coalesce(p_note, ''), updated_at = now()
  where id = p_log_id
    and category = 'stamp'
    and coalesce(jsonb->'items', '[]'::jsonb) @> '[{"inventoryAction":"exchange_in"}]'::jsonb
        or (
          id = p_log_id
          and category = 'stamp'
          and coalesce(jsonb->'items', '[]'::jsonb) @> '[{"inventoryAction":"exchange_out"}]'::jsonb
        );

  if not found then raise exception 'EXCHANGE_HISTORY_LOG_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.update_exchange_history_note(bigint, text) from public, anon;
grant execute on function public.update_exchange_history_note(bigint, text) to authenticated;
notify pgrst, 'reload schema';
