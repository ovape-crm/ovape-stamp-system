create table if not exists public.return_hold_processing_history (
  id uuid primary key default gen_random_uuid(),
  hold_id uuid not null references public.defective_inventory_holds(id),
  action text not null check(action in ('supplier_return','scrap','service')),
  note text, service_customer_id bigint, source_log_id bigint references public.logs(id),
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id)
);
alter table public.return_hold_processing_history enable row level security;
create policy "master manages return hold processing history" on public.return_hold_processing_history for all to authenticated using (public.is_current_user_master()) with check (public.is_current_user_master());

create or replace function public.log_return_hold_processing() returns trigger language plpgsql security definer set search_path=public as $$
declare v_action text; v_note text; v_log_id bigint; begin
 if old.status=new.status or new.status not in ('returned','scrapped','serviced') then return new; end if;
 v_action:=case new.status when 'returned' then 'supplier_return' when 'scrapped' then 'scrap' else 'service' end;
 if v_action='supplier_return' then select concat_ws(' · ','도매처 반품',case settlement_type when 'supplier_credit' then '적립금' else '계좌 환불' end,note), null from public.supplier_refund_settlements where defective_hold_id=new.id order by created_at desc limit 1 into v_note,v_log_id;
 elsif v_action='scrap' then select note,id into v_note,v_log_id from public.logs where id=new.scrap_log_id;
 else select note,id into v_note,v_log_id from public.logs where id=new.service_log_id; end if;
 insert into public.return_hold_processing_history(hold_id,action,note,service_customer_id,source_log_id,created_by) values(new.id,v_action,v_note,new.service_customer_id,v_log_id,auth.uid());
 insert into public.logs(admin_id,customer_id,category,action,note,jsonb) values(auth.uid(),new.customer_id,'customer','no-stamp',concat('반품 보관 처리 · ',coalesce(v_note,new.item_name||' '||new.quantity||'개')),jsonb_build_object('returnHoldId',new.id,'returnHoldAction',v_action));
 return new; end $$;
create trigger z_return_hold_processing_history after update of status on public.defective_inventory_holds for each row execute function public.log_return_hold_processing();
