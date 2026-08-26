create or replace function public.attach_inventory_adjustment_type_to_cost_events()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_item jsonb; v_index integer := 0; v_type text;
begin
  if new.category <> 'stamp' then return new; end if;
  for v_item in select value from jsonb_array_elements(coalesce(new.jsonb->'items','[]'::jsonb)) loop
    v_index := v_index + 1;
    v_type := nullif(v_item->>'adjustmentType','');
    if v_type not in ('correction_in','correction_out','free_in','loss_out') then continue; end if;
    update public.inventory_cost_events
    set metadata = metadata || jsonb_build_object('adjustmentType', v_type)
    where reference_type = 'stamp_log'
      and reference_id = new.id::text
      and reference_line_key = v_index::text
      and event_type in ('adjustment_in','adjustment_out');
  end loop;
  return new;
end $$;

drop trigger if exists zzz_attach_inventory_adjustment_type_to_cost_events_trigger on public.logs;
create trigger zzz_attach_inventory_adjustment_type_to_cost_events_trigger
after insert or update of jsonb,category on public.logs
for each row execute function public.attach_inventory_adjustment_type_to_cost_events();

revoke all on function public.attach_inventory_adjustment_type_to_cost_events()
from public, anon, authenticated;
