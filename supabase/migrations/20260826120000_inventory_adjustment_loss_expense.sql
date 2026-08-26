create unique index if not exists settlement_expenses_inventory_loss_source_log_unique
  on public.settlement_expenses(source_log_id)
  where source_log_id is not null and category = '재고손실';

create or replace function public.process_inventory_adjustment_loss_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_amount integer; v_note text; v_category_id uuid; v_store text;
begin
  if new.category <> 'stamp' then return new; end if;
  with loss_items as (
    select item.ordinality::text as line_key, item.value,
      case item.value->>'adjustmentReason' when 'damage' then '파손' when 'loss' then '분실' when 'disposal' then '폐기' end reason
    from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) with ordinality item(value,ordinality)
    where item.value->>'inventoryAction'='adjustment_out'
      and item.value->>'adjustmentReason' in ('damage','loss','disposal')
  ), costs as (
    select loss.*, event.total_cost from loss_items loss
    left join public.inventory_cost_events event on event.reference_type='stamp_log'
      and event.reference_id=new.id::text and event.reference_line_key=loss.line_key
      and event.event_type='adjustment_out'
  )
  select case when count(*) filter(where total_cost is null)>0 then null else sum(total_cost)::integer end,
    string_agg(value->>'itemName'||' '||(value->>'quantity')||'개 ('||reason||')',', ' order by line_key::integer)
  into v_amount,v_note from costs;
  if v_amount is null or v_amount=0 then return new; end if;
  v_store:=case when new.jsonb->>'storeName' in ('ovape','eguvape','common','other') then new.jsonb->>'storeName' else 'common' end;
  insert into public.settlement_expense_categories(name,is_active,created_by)
  values('재고손실',true,new.admin_id) on conflict(name) do update set is_active=true returning id into v_category_id;
  insert into public.settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id)
  values((new.created_at at time zone 'Asia/Seoul')::date,v_category_id,'재고손실',v_amount,v_store,false,v_note,new.admin_id,new.id)
  on conflict(source_log_id) where source_log_id is not null and category='재고손실'
  do update set amount=excluded.amount,store=excluded.store,note=excluded.note,updated_at=now();
  update public.inventory_cost_events event set settlement_effect='inventory_loss',
    metadata=event.metadata||jsonb_build_object('adjustmentLoss',true)
  where event.reference_type='stamp_log' and event.reference_id=new.id::text and event.event_type='adjustment_out';
  return new;
end $$;

drop trigger if exists zx_process_inventory_adjustment_loss_expense_trigger on public.logs;
create trigger zx_process_inventory_adjustment_loss_expense_trigger after insert on public.logs
for each row execute function public.process_inventory_adjustment_loss_expense();
revoke all on function public.process_inventory_adjustment_loss_expense() from public,anon,authenticated;
