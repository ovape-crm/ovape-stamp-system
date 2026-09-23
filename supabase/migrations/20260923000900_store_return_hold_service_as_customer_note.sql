create or replace function public.copy_return_hold_service_note_to_customer()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_note text;
begin
  if old.status <> 'serviced' and new.status = 'serviced' and new.service_customer_id is not null then
    select note into v_note
      from public.return_hold_processing_history
      where hold_id = new.id and action = 'service'
      order by created_at desc limit 1;
    if nullif(btrim(coalesce(v_note, '')), '') is not null then
      update public.customers
        set note = case
          when nullif(btrim(coalesce(note, '')), '') is null then v_note
          when position(v_note in note) > 0 then note
          else note || E'\n' || v_note
        end,
        updated_at = now()
        where id = new.service_customer_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists zzz_copy_return_hold_service_note_to_customer on public.defective_inventory_holds;
create trigger zzz_copy_return_hold_service_note_to_customer
  after update of status on public.defective_inventory_holds
  for each row execute function public.copy_return_hold_service_note_to_customer();

update public.customers customer
set note = case
  when nullif(btrim(coalesce(customer.note, '')), '') is null then history.note
  when position(history.note in customer.note) > 0 then customer.note
  else customer.note || E'\n' || history.note
end,
updated_at = now()
from public.return_hold_processing_history history
where history.action = 'service'
  and history.service_customer_id = customer.id
  and nullif(btrim(coalesce(history.note, '')), '') is not null;
