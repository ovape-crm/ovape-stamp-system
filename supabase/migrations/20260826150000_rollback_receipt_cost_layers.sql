create or replace function public.rollback_purchase_receipt_cost_layers()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_layer record;
begin
  if tg_op='UPDATE' and (old.reversed_at is not null or new.reversed_at is null) then return new; end if;
  for v_layer in
    select layer.* from public.inventory_cost_layers layer join public.inventory_cost_events event on event.id=layer.source_event_id
    where event.reference_type='purchase_receipt' and event.reference_id=old.id::text
  loop
    if v_layer.remaining_quantity<>v_layer.original_quantity then
      raise exception 'COST_LAYER_ALREADY_CONSUMED: 이미 판매 또는 출고에 사용된 입고 원가가 있어 입고를 취소할 수 없습니다.';
    end if;
  end loop;
  delete from public.inventory_cost_events where reference_type='purchase_receipt' and reference_id=old.id::text;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists rollback_purchase_receipt_cost_layers_trigger on public.inventory_purchase_receipts;
create trigger rollback_purchase_receipt_cost_layers_trigger before update of reversed_at or delete on public.inventory_purchase_receipts
for each row execute function public.rollback_purchase_receipt_cost_layers();
revoke all on function public.rollback_purchase_receipt_cost_layers() from public,anon,authenticated;
