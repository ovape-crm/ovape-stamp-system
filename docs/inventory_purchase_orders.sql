-- 거래처 및 입고 예정/부분 입고 관리
create extension if not exists pgcrypto;

create table if not exists public.inventory_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  customer_service_phone text,
  as_center_phone text,
  courier_company text,
  order_cutoff_time time,
  note text,
  is_use boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.inventory_suppliers(id),
  ordered_on date not null,
  status text not null default 'pending' check (status in ('pending','partial','completed','closed','cancelled')),
  note text,
  closed_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.inventory_purchase_orders(id) on delete cascade,
  item_name text not null,
  ordered_quantity integer not null check (ordered_quantity > 0),
  received_quantity integer not null default 0 check (received_quantity >= 0),
  pending_quantity integer not null default 0 check (pending_quantity >= 0),
  unit_price integer check (unit_price is null or unit_price >= 0),
  note text,
  quantity_checked_by uuid references auth.users(id),
  quantity_checked_at timestamptz,
  unique(order_id, item_name)
);

create table if not exists public.inventory_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.inventory_purchase_orders(id),
  arrived_on date not null,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversed_reason text
);

create table if not exists public.inventory_purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.inventory_purchase_receipts(id) on delete cascade,
  order_line_id uuid not null references public.inventory_purchase_order_lines(id),
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer check (unit_price is null or unit_price >= 0),
  quantity_checked_by uuid references auth.users(id),
  quantity_checked_at timestamptz
);
alter table public.inventory_purchase_receipt_lines add column if not exists quantity_checked_by uuid references auth.users(id);
alter table public.inventory_purchase_receipt_lines add column if not exists quantity_checked_at timestamptz;
alter table public.inventory_purchase_receipt_lines add column if not exists note text;
alter table public.inventory_purchase_order_lines add column if not exists quantity_check_note text;
alter table public.inventory_purchase_receipt_lines add column if not exists quantity_check_note text;
update public.inventory_purchase_order_lines
set quantity_check_note=coalesce(quantity_check_note,substring(note from '\[자동 수량 확인\]\s*(.*)$')),
    note=nullif(btrim(regexp_replace(coalesce(note,''), E'\\n?\\[자동 수량 확인\\].*$', '')),'')
where note like '%[자동 수량 확인]%';
update public.inventory_purchase_receipt_lines
set quantity_check_note=coalesce(quantity_check_note,substring(note from '\[자동 수량 확인\]\s*(.*)$')),
    note=nullif(btrim(regexp_replace(coalesce(note,''), E'\\n?\\[자동 수량 확인\\].*$', '')),'')
where note like '%[자동 수량 확인]%';

create index if not exists inventory_purchase_orders_supplier_idx on public.inventory_purchase_orders(supplier_id, ordered_on desc);
create index if not exists inventory_purchase_receipts_order_idx on public.inventory_purchase_receipts(order_id, arrived_on desc);

alter table public.inventory_suppliers enable row level security;
alter table public.inventory_purchase_orders enable row level security;
alter table public.inventory_purchase_order_lines enable row level security;
alter table public.inventory_purchase_receipts enable row level security;
alter table public.inventory_purchase_receipt_lines enable row level security;
grant select on public.inventory_suppliers, public.inventory_purchase_orders, public.inventory_purchase_order_lines, public.inventory_purchase_receipts, public.inventory_purchase_receipt_lines to authenticated;
revoke all on public.inventory_suppliers, public.inventory_purchase_orders, public.inventory_purchase_order_lines, public.inventory_purchase_receipts, public.inventory_purchase_receipt_lines from anon;

do $$ declare t text; begin
  foreach t in array array['inventory_suppliers','inventory_purchase_orders','inventory_purchase_order_lines','inventory_purchase_receipts','inventory_purchase_receipt_lines'] loop
    execute format('drop policy if exists "authenticated read %s" on public.%I', t, t);
    execute format('create policy "authenticated read %s" on public.%I for select to authenticated using (true)', t, t);
  end loop;
end $$;

create or replace function public.save_inventory_supplier(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare result_id uuid; supplier_name text := btrim(p_data->>'name');
begin
  if not public.is_inventory_admin() then raise exception '관리자만 거래처를 관리할 수 있습니다.'; end if;
  if supplier_name = '' then raise exception '거래처명을 입력해 주세요.'; end if;
  if p_id is null then
    insert into public.inventory_suppliers(name,customer_service_phone,as_center_phone,courier_company,order_cutoff_time,note,is_use,created_by)
    values(supplier_name,nullif(btrim(p_data->>'customer_service_phone'),''),nullif(btrim(p_data->>'as_center_phone'),''),nullif(btrim(p_data->>'courier_company'),''),nullif(p_data->>'order_cutoff_time','')::time,nullif(btrim(p_data->>'note'),''),coalesce((p_data->>'is_use')::boolean,true),auth.uid()) returning id into result_id;
  else
    update public.inventory_suppliers set name=supplier_name,customer_service_phone=nullif(btrim(p_data->>'customer_service_phone'),''),as_center_phone=nullif(btrim(p_data->>'as_center_phone'),''),courier_company=nullif(btrim(p_data->>'courier_company'),''),order_cutoff_time=nullif(p_data->>'order_cutoff_time','')::time,note=nullif(btrim(p_data->>'note'),''),is_use=coalesce((p_data->>'is_use')::boolean,true),updated_at=now() where id=p_id returning id into result_id;
  end if;
  return result_id;
end $$;

create or replace function public.create_inventory_purchase_order(p_supplier_id uuid,p_ordered_on date,p_note text,p_lines jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare order_id uuid; entry jsonb; clean_name text; qty integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists(select 1 from public.inventory_suppliers where id=p_supplier_id and is_use=true) then raise exception '사용 가능한 거래처를 선택해 주세요.'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception '품목을 추가해 주세요.'; end if;
  insert into public.inventory_purchase_orders(supplier_id,ordered_on,note,created_by) values(p_supplier_id,p_ordered_on, nullif(btrim(p_note),''),auth.uid()) returning id into order_id;
  for entry in select value from jsonb_array_elements(p_lines) loop
    clean_name:=btrim(entry->>'item_name'); qty:=(entry->>'quantity')::integer;
    if clean_name='' or qty<=0 then raise exception '품목과 주문 수량을 확인해 주세요.'; end if;
    insert into public.inventory_purchase_order_lines(
      order_id,
      item_name,
      ordered_quantity,
      pending_quantity,
      unit_price,
      note
    )
    values(
      order_id,
      clean_name,
      qty,
      qty,
      nullif(entry->>'unit_price','')::integer,
      nullif(btrim(entry->>'note'),'')
    );
  end loop;
  return order_id;
end $$;

create or replace function public.set_purchase_arrival_quantity(p_line_id uuid,p_quantity integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_quantity<0 then raise exception '수량은 0개 이상이어야 합니다.'; end if;
  update public.inventory_purchase_order_lines l set pending_quantity=p_quantity,quantity_checked_by=null,quantity_checked_at=null
  from public.inventory_purchase_orders o where l.id=p_line_id and o.id=l.order_id and o.status in ('pending','partial');
  if not found then raise exception '수정할 수 없는 입고 예정 품목입니다.'; end if;
end $$;

create or replace function public.check_purchase_arrival_quantity(p_line_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare difference integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select l.pending_quantity - greatest(0, l.ordered_quantity-l.received_quantity)
  into difference
  from public.inventory_purchase_order_lines l
  join public.inventory_purchase_orders o on o.id=l.order_id
  where l.id=p_line_id and o.status in ('pending','partial');
  if not found then raise exception '수량을 확인할 수 없는 입고 예정 품목입니다.'; end if;
  update public.inventory_purchase_order_lines
  set quantity_checked_by=auth.uid(),quantity_checked_at=now(),
      quantity_check_note=case
        when difference > 0 then format('%s개 추가 입고',difference)
        when difference < 0 then format('%s개 미입고',abs(difference))
        else null end
  where id=p_line_id;
end $$;

create or replace function public.process_purchase_arrival(p_order_id uuid,p_arrived_on date,p_note text)
returns uuid language plpgsql security definer set search_path=public as $$
declare receipt_id uuid; line record; next_qty integer; processed integer:=0;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_arrived_on is null then raise exception '도착일을 선택해 주세요.'; end if;
  perform 1 from public.inventory_purchase_orders where id=p_order_id and status in ('pending','partial') for update;
  if not found then raise exception '입고 처리할 수 없는 주문입니다.'; end if;
  if exists(select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and pending_quantity>0 and quantity_checked_at is null) then raise exception '수량 체크가 완료되지 않은 품목이 있습니다.'; end if;
  if not exists(select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and pending_quantity>0 and quantity_checked_at is not null) then raise exception '입고 처리할 품목이 없습니다.'; end if;
  insert into public.inventory_purchase_receipts(order_id,arrived_on,note,created_by) values(p_order_id,p_arrived_on,nullif(btrim(p_note),''),auth.uid()) returning id into receipt_id;
  for line in select * from public.inventory_purchase_order_lines where order_id=p_order_id and pending_quantity>0 and quantity_checked_at is not null for update loop
    insert into public.inventory_balances(item_name,quantity,updated_at) values(line.item_name,line.pending_quantity,now()) on conflict(item_name) do update set quantity=inventory_balances.quantity+excluded.quantity,updated_at=now() returning quantity into next_qty;
    insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,unit_price,reference_type,reference_id,note,created_by)
    values(line.item_name,'purchase_in',line.pending_quantity,next_qty,line.unit_price,'purchase_receipt',receipt_id::text,coalesce(nullif(btrim(p_note),''),'입고 처리'),auth.uid());
    insert into public.inventory_purchase_receipt_lines(receipt_id,order_line_id,item_name,quantity,unit_price,quantity_checked_by,quantity_checked_at,note,quantity_check_note) values(receipt_id,line.id,line.item_name,line.pending_quantity,line.unit_price,line.quantity_checked_by,line.quantity_checked_at,line.note,line.quantity_check_note);
    update public.inventory_purchase_order_lines set received_quantity=received_quantity+pending_quantity,pending_quantity=0,quantity_checked_by=null,quantity_checked_at=null,quantity_check_note=null where id=line.id;
    processed:=processed+1;
  end loop;
  update public.inventory_purchase_orders set status=case when not exists(select 1 from public.inventory_purchase_order_lines where order_id=p_order_id and received_quantity<ordered_quantity) then 'completed' else 'partial' end,updated_at=now() where id=p_order_id;
  return receipt_id;
end $$;

create or replace function public.close_purchase_order_remainder(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.is_inventory_admin() then raise exception '관리자만 미입고 잔량을 종료할 수 있습니다.'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception '종료 사유를 입력해 주세요.'; end if;
  update public.inventory_purchase_orders set status='closed',closed_reason=btrim(p_reason),updated_at=now() where id=p_order_id and status in ('pending','partial');
  if not found then raise exception '종료할 수 없는 주문입니다.'; end if;
end $$;

create or replace function public.reverse_purchase_receipt(p_receipt_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare receipt record; line record; next_qty integer;
begin
  if not public.is_inventory_admin() then raise exception '관리자만 완료 입고를 취소할 수 있습니다.'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception '취소 사유를 입력해 주세요.'; end if;
  select * into receipt from public.inventory_purchase_receipts where id=p_receipt_id for update;
  if not found or receipt.reversed_at is not null then raise exception '취소할 수 없는 입고입니다.'; end if;
  if not exists(select 1 from public.inventory_movements where reference_type='purchase_receipt' and reference_id=p_receipt_id::text) then
    raise exception '재고 초기화 이전 입고 이력은 취소할 수 없습니다.';
  end if;
  for line in select * from public.inventory_purchase_receipt_lines where receipt_id=p_receipt_id loop
    update public.inventory_balances set quantity=quantity-line.quantity,updated_at=now() where item_name=line.item_name returning quantity into next_qty;
    insert into public.inventory_movements(item_name,movement_type,quantity_delta,quantity_after,unit_price,reference_type,reference_id,note,created_by)
    values(line.item_name,'reversal',-line.quantity,next_qty,line.unit_price,'purchase_receipt_reversal',p_receipt_id::text,btrim(p_reason),auth.uid());
    update public.inventory_purchase_order_lines set received_quantity=greatest(0,received_quantity-line.quantity) where id=line.order_line_id;
  end loop;
  update public.inventory_purchase_receipts set reversed_at=now(),reversed_by=auth.uid(),reversed_reason=btrim(p_reason) where id=p_receipt_id;
  update public.inventory_purchase_orders set status=case when exists(select 1 from public.inventory_purchase_order_lines where order_id=receipt.order_id and received_quantity>0) then 'partial' else 'pending' end,updated_at=now() where id=receipt.order_id;
end $$;

create or replace function public.delete_purchase_order_history(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare receipt record; line record;
begin
  if not public.is_inventory_admin() then raise exception '관리자만 입고 이력을 삭제할 수 있습니다.'; end if;
  if exists(select 1 from public.inventory_purchase_orders where id=p_order_id and status in ('pending','partial')) then
    raise exception '입고 대기 건은 이력에서 삭제할 수 없습니다.';
  end if;
  if not exists(select 1 from public.inventory_purchase_orders where id=p_order_id) then
    raise exception '삭제할 입고 이력을 찾을 수 없습니다.';
  end if;
  for receipt in select * from public.inventory_purchase_receipts where order_id=p_order_id and reversed_at is null for update loop
    if exists(select 1 from public.inventory_movements where reference_type='purchase_receipt' and reference_id=receipt.id::text) then
      for line in select * from public.inventory_purchase_receipt_lines where receipt_id=receipt.id loop
        update public.inventory_balances set quantity=quantity-line.quantity,updated_at=now() where item_name=line.item_name;
      end loop;
    end if;
  end loop;
  delete from public.inventory_movements
  where reference_id in (select id::text from public.inventory_purchase_receipts where order_id=p_order_id)
    and reference_type in ('purchase_receipt','purchase_receipt_reversal');
  delete from public.inventory_purchase_receipts where order_id=p_order_id;
  delete from public.inventory_purchase_orders where id=p_order_id;
end $$;

revoke all on function public.save_inventory_supplier(uuid,jsonb), public.create_inventory_purchase_order(uuid,date,text,jsonb), public.set_purchase_arrival_quantity(uuid,integer), public.check_purchase_arrival_quantity(uuid), public.process_purchase_arrival(uuid,date,text), public.close_purchase_order_remainder(uuid,text), public.reverse_purchase_receipt(uuid,text), public.delete_purchase_order_history(uuid) from public,anon;
grant execute on function public.save_inventory_supplier(uuid,jsonb), public.create_inventory_purchase_order(uuid,date,text,jsonb), public.set_purchase_arrival_quantity(uuid,integer), public.check_purchase_arrival_quantity(uuid), public.process_purchase_arrival(uuid,date,text), public.close_purchase_order_remainder(uuid,text), public.reverse_purchase_receipt(uuid,text), public.delete_purchase_order_history(uuid) to authenticated;
notify pgrst,'reload schema';
