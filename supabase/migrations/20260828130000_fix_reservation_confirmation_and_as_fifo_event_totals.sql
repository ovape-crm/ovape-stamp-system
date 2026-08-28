-- 예약 확정은 로그 전환과 스탬프 반영을 하나의 원자적 처리로 보장한다.
create or replace function public.confirm_reservation_stamp_operation_v2(
  p_log_id text,
  p_confirmed_worker_name text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  target_log public.logs%rowtype;
  stamp_amount integer := 0;
  current_count integer;
  v_confirmed_at timestamptz := now();
  v_reservation_worker_name text;
  v_confirmed_worker_name text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into target_log from public.logs where id::text=p_log_id for update;
  if not found or target_log.category<>'reservation' then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if target_log.action ~ '^add-[0-9]+$' then stamp_amount:=split_part(target_log.action,'-',2)::integer; end if;
  v_reservation_worker_name:=nullif(btrim(coalesce(target_log.jsonb->>'createdWorkerName','')),'');
  if v_reservation_worker_name is null then
    select case when oss_role='master' then '마스터' when oss_role='admin' then '관리자' else coalesce(nullif(btrim(name),''),nullif(btrim(email),''),'알 수 없음') end
      into v_reservation_worker_name from public.users where id=target_log.admin_id;
  end if;
  v_confirmed_worker_name:=nullif(btrim(coalesce(p_confirmed_worker_name,'')),'');
  if v_confirmed_worker_name is null then
    select case when oss_role='master' then '마스터' when oss_role='admin' then '관리자' else coalesce(nullif(btrim(name),''),nullif(btrim(email),''),'알 수 없음') end
      into v_confirmed_worker_name from public.users where id=auth.uid();
  end if;

  -- 출고 이력 전환이 먼저 성공해야만 이후 스탬프가 반영된다.
  update public.logs set category='stamp',admin_id=auth.uid(),created_at=v_confirmed_at,updated_at=v_confirmed_at,
    jsonb=coalesce(target_log.jsonb,'{}'::jsonb)||jsonb_build_object(
      'reservationCreatedWorkerName',coalesce(v_reservation_worker_name,'알 수 없음'),
      'reservationCreatedAt',target_log.created_at,
      'confirmedWorkerName',coalesce(v_confirmed_worker_name,'알 수 없음'),
      'confirmedAt',v_confirmed_at
    ) where id=target_log.id and category='reservation';
  if not found then raise exception 'RESERVATION_CONFIRMATION_FAILED'; end if;

  if stamp_amount>0 then
    select count into current_count from public.stamps where customer_id=target_log.customer_id for update;
    if not found then insert into public.stamps(customer_id,count) values(target_log.customer_id,stamp_amount);
    else update public.stamps set count=count+stamp_amount where customer_id=target_log.customer_id; end if;
  end if;
end;
$$;

-- 노진호(01026350447) 예약 6638은 예약 상태로 남았는데 3스탬프만 잘못 반영되어 복구한다.
update public.stamps set count=count-3 where customer_id=1661 and count>=3;
update public.logs set jsonb=coalesce(jsonb,'{}'::jsonb)||jsonb_build_object('failedConfirmationStampReversedAt',now())
where id=6638 and category='reservation' and action='add-3';

-- A/S·교환입고는 입고 전표가 0원이어도 FIFO 층의 실제 원가가 원장 이벤트에도 반영되어야 한다.
update public.inventory_cost_events event
set total_cost=layer.unit_cost*event.quantity
from public.inventory_cost_layers layer
where layer.source_event_id=event.id
  and layer.id in (
    'b5a99cca-e233-4fe6-bd94-7013d670ae31'::uuid,
    'b530c010-311f-4fc7-98fa-76e4c7198806'::uuid,
    'd283c38a-88fe-42c5-bd32-eeb6578d0631'::uuid,
    '2139c2fb-83c4-4a1e-a7f7-4431ca8c4eee'::uuid,
    'ea1fd2ae-95fc-4666-8829-f58683bc35f8'::uuid
  );

revoke all on function public.confirm_reservation_stamp_operation_v2(text,text) from public,anon;
grant execute on function public.confirm_reservation_stamp_operation_v2(text,text) to authenticated;
