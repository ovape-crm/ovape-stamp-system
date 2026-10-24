-- The inventory history view displays item_remark. Keep it identical to the
-- edited inbound memo rather than saving only the fixed action text there.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  where p.oid = 'public.edit_after_service_status_processing_log(bigint, bigint, text, date, text, boolean, integer)'::regprocedure;

  if v_definition is null then
    raise exception 'EDIT_AFTER_SERVICE_STATUS_PROCESSING_LOG_NOT_FOUND';
  end if;
  if position('item_remark = v_inventory_action' in v_definition) = 0 then
    raise exception 'EXCHANGE_INBOUND_MEMO_UPDATE_NOT_FOUND';
  end if;

  execute replace(
    v_definition,
    'item_remark = v_inventory_action',
    'item_remark = v_inventory_note'
  );
end;
$$;
