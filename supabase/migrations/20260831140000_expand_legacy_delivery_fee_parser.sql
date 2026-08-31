-- 예전 문구의 "택배비 3,880원"처럼 공백·쉼표가 있는 금액도 읽는다.
create or replace function public.sync_outbound_delivery_fee_expense()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_category text; v_fee text; v_amount integer; v_category_id uuid; v_name text; v_phone text; v_store text;
begin
  if tg_op='DELETE' then delete from settlement_expenses where source_log_id=old.id and category in ('택배비','배달대행비'); return old; end if;
  if new.category<>'stamp' then delete from settlement_expenses where source_log_id=new.id and category in ('택배비','배달대행비'); return new; end if;
  if new.jsonb->>'deliveryMethod'='parcel' then v_category:='택배비'; v_fee:=new.jsonb->>'deliveryFee';
  elsif new.jsonb->>'deliveryMethod'='delivery' and new.jsonb->>'deliveryType'='agency' then v_category:='배달대행비'; v_fee:=new.jsonb->>'deliveryFee';
  elsif coalesce(new.note,'') ~ '배달대행비[^0-9]{0,12}[0-9][0-9,]*' then v_category:='배달대행비'; v_fee:=replace(substring(new.note from '배달대행비[^0-9]{0,12}([0-9][0-9,]*)'),',','');
  elsif coalesce(new.note,'') ~ '택배(?:비)?[^0-9]{0,12}[0-9][0-9,]*' then v_category:='택배비'; v_fee:=replace(substring(new.note from '택배(?:비)?[^0-9]{0,12}([0-9][0-9,]*)'),',','');
  else delete from settlement_expenses where source_log_id=new.id and category in ('택배비','배달대행비'); return new; end if;
  if coalesce(v_fee,'') !~ '^\d+$' or v_fee::numeric<=0 then return new; end if; v_amount:=v_fee::numeric::integer;
  select name,phone into v_name,v_phone from customers where id=new.customer_id;
  v_store:=case when new.jsonb->>'storeName' in ('ovape','eguvape') then new.jsonb->>'storeName' else 'ovape' end;
  insert into settlement_expense_categories(name,is_active,created_by) values(v_category,true,new.admin_id) on conflict(name) do update set is_active=true returning id into v_category_id;
  insert into settlement_expenses(expense_date,category_id,category,amount,store,is_recurring,note,created_by,source_log_id)
  values((new.created_at at time zone 'Asia/Seoul')::date,v_category_id,v_category,v_amount,v_store,false,coalesce(nullif(btrim(v_name),''),'고객 미지정')||','||coalesce(nullif(btrim(v_phone),''),'번호 없음')||' '||v_category,new.admin_id,new.id)
  on conflict(source_log_id) where source_log_id is not null and category in ('택배비','배달대행비') do update set amount=excluded.amount,category=excluded.category,category_id=excluded.category_id,note=excluded.note,updated_at=now();
  return new;
end; $$;
drop trigger if exists zzz_sync_outbound_delivery_fee_expense_trigger on public.logs;
create trigger zzz_sync_outbound_delivery_fee_expense_trigger after insert or update of jsonb,note,category,customer_id,created_at or delete on public.logs for each row execute function public.sync_outbound_delivery_fee_expense();
