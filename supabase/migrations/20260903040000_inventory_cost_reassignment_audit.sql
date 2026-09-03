-- 원가 재배정은 재고 수량을 변경하지 않는 마스터 승인 작업으로만 남긴다.
create table if not exists public.inventory_cost_reassignment_runs (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  from_at timestamptz not null,
  inventory_quantity_before integer not null,
  inventory_quantity_after integer not null,
  affected_outbound_count integer not null default 0,
  cost_before integer not null default 0,
  cost_after integer not null default 0,
  status text not null check (status in ('previewed', 'approved', 'applied', 'rejected')),
  note text,
  requested_by uuid references public.users(id),
  approved_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

alter table public.inventory_cost_reassignment_runs enable row level security;
create policy "master manages cost reassignment runs"
on public.inventory_cost_reassignment_runs for all to authenticated
using (exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'))
with check (exists (select 1 from public.users where id = auth.uid() and oss_role = 'master'));

create or replace function public.preview_inventory_cost_reassignment(
  p_item_name text,
  p_from_at timestamptz,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_item text := btrim(p_item_name); v_stock integer; v_count integer; v_cost integer; v_run_id uuid;
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then raise exception 'MASTER_REQUIRED'; end if;
  if v_item='' or p_from_at is null then raise exception 'INVALID_REASSIGNMENT_SCOPE'; end if;
  select coalesce(quantity,0) into v_stock from public.inventory_balances where item_name=v_item;
  select count(*),coalesce(sum(total_cost),0)::integer into v_count,v_cost
  from public.inventory_cost_events
  where item_name=v_item and direction='out' and event_at>=p_from_at;
  insert into public.inventory_cost_reassignment_runs(item_name,from_at,inventory_quantity_before,inventory_quantity_after,affected_outbound_count,cost_before,cost_after,status,note,requested_by)
  values(v_item,p_from_at,coalesce(v_stock,0),coalesce(v_stock,0),v_count,v_cost,v_cost,'previewed',nullif(btrim(coalesce(p_note,'')),''),auth.uid()) returning id into v_run_id;
  return v_run_id;
end $$;
revoke all on function public.preview_inventory_cost_reassignment(text,timestamptz,text) from public,anon;
grant execute on function public.preview_inventory_cost_reassignment(text,timestamptz,text) to authenticated;
