create or replace function public.rollback_stamp_log_cost_ledger()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event record; v_layer record;
begin
  if old.category<>'stamp' then return old; end if;
  for v_layer in
    select layer.* from public.inventory_cost_layers layer
    join public.inventory_cost_events event on event.id=layer.source_event_id
    where event.reference_type='stamp_log' and event.reference_id=old.id::text
  loop
    if v_layer.remaining_quantity<>v_layer.original_quantity then
      raise exception 'COST_LAYER_ALREADY_CONSUMED: 후속 판매에 사용된 입고 원가가 있어 이 기록을 수정하거나 삭제할 수 없습니다.';
    end if;
  end loop;
  for v_event in
    select allocation.source_layer_id,sum(allocation.quantity)::integer quantity
    from public.inventory_cost_events event join public.inventory_cost_allocations allocation on allocation.outbound_event_id=event.id
    where event.reference_type='stamp_log' and event.reference_id=old.id::text group by allocation.source_layer_id
  loop
    update public.inventory_cost_layers set remaining_quantity=remaining_quantity+v_event.quantity where id=v_event.source_layer_id;
  end loop;
  delete from public.inventory_cost_events where reference_type='stamp_log' and reference_id=old.id::text;
  if tg_op='UPDATE' then
    delete from public.settlement_expenses where source_log_id=old.id and category in ('고객 교환 원가차액','재고손실');
    return new;
  end if;
  return old;
end $$;

drop trigger if exists a_rollback_stamp_log_cost_ledger_trigger on public.logs;
create trigger a_rollback_stamp_log_cost_ledger_trigger before update of jsonb,category or delete on public.logs
for each row execute function public.rollback_stamp_log_cost_ledger();

drop trigger if exists z_sync_standard_outbound_cost_ledger_trigger on public.logs;
create trigger z_sync_standard_outbound_cost_ledger_trigger after insert or update of jsonb,category on public.logs
for each row execute function public.sync_standard_outbound_cost_ledger();
drop trigger if exists zx_process_inventory_adjustment_loss_expense_trigger on public.logs;
create trigger zx_process_inventory_adjustment_loss_expense_trigger after insert or update of jsonb,category on public.logs
for each row execute function public.process_inventory_adjustment_loss_expense();
drop trigger if exists zy_attach_after_service_id_to_cost_events_trigger on public.logs;
create trigger zy_attach_after_service_id_to_cost_events_trigger after insert or update of jsonb,category on public.logs
for each row execute function public.attach_after_service_id_to_cost_events();
drop trigger if exists zz_process_customer_exchange_cost_ledger_trigger on public.logs;
create trigger zz_process_customer_exchange_cost_ledger_trigger after insert or update of jsonb,category on public.logs
for each row execute function public.process_customer_exchange_cost_ledger();

revoke all on function public.rollback_stamp_log_cost_ledger() from public,anon,authenticated;
