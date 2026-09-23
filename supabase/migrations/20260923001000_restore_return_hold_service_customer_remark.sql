-- 반품 보관 손님 서비스 메모는 고객 정보의 특이사항 필드가 아니라
-- 고객 상세의 "고객 특이사항"(스탬프 이력)으로 남긴다.
drop trigger if exists zzz_copy_return_hold_service_note_to_customer on public.defective_inventory_holds;
drop function if exists public.copy_return_hold_service_note_to_customer();

-- 이전 마이그레이션에서 고객 정보 메모에 추가한 서비스 메모만 되돌린다.
update public.customers customer
set note = btrim(replace(customer.note, history.note, ''), E'\n'),
    updated_at = now()
from public.return_hold_processing_history history
where history.action = 'service'
  and history.service_customer_id = customer.id
  and nullif(btrim(coalesce(history.note, '')), '') is not null
  and position(history.note in coalesce(customer.note, '')) > 0;

-- 일반 고객 특이사항 버튼은 스탬프 이력(category=stamp, paymentType=remark)을 만든다.
-- 반품 보관 서비스도 같은 형식으로 기록하여 고객 상세 이력에서 동일하게 보이게 한다.
create or replace function public.log_return_hold_processing()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_action text;
  v_note text;
  v_raw_note text;
  v_log_id bigint;
begin
  if old.status = new.status or new.status not in ('returned', 'scrapped', 'serviced') then return new; end if;
  v_action := case new.status when 'returned' then 'supplier_return' when 'scrapped' then 'scrap' else 'service' end;
  if v_action = 'supplier_return' then
    select concat_ws(' · ', '도매처 반품', case settlement_type when 'supplier_credit' then '적립금' else '계좌 환불' end, note), null
      into v_note, v_log_id
      from public.supplier_refund_settlements
      where defective_hold_id = new.id
      order by created_at desc limit 1;
  elsif v_action = 'scrap' then
    select note, id into v_note, v_log_id from public.logs where id = new.scrap_log_id;
  else
    select note, id into v_raw_note, v_log_id from public.logs where id = new.service_log_id;
    v_note := nullif(regexp_replace(coalesce(v_raw_note, ''), '^.*서비스[[:space:]]*\\((.*)\\)[[:space:]]*$', '\\1'), '');
    if v_note = v_raw_note then v_note := null; end if;
    update public.logs
      set category = 'stamp', action = 'no-stamp', note = coalesce(v_note, '반품 보관 손님 서비스'),
          jsonb = jsonb_set(coalesce(jsonb, '{}'::jsonb), '{paymentType}', '"remark"'::jsonb, true)
      where id = new.service_log_id;
  end if;
  insert into public.return_hold_processing_history(hold_id, action, note, service_customer_id, source_log_id, created_by)
  values(new.id, v_action, v_note, new.service_customer_id, v_log_id, auth.uid());
  return new;
end $$;

-- 이미 처리된 황상민 건도 고객 특이사항 버튼으로 만든 이력과 같은 형식으로 복구한다.
-- 이 보정은 배포 마이그레이션에서만 수행되며, 기존 이력 보호·원가 동기화 트리거는
-- 변경 대상의 category/jsonb 수정을 인증된 화면 요청으로만 허용하므로 잠시 비활성화한다.
-- 현재 서비스 비용은 이미 별도 비용 이력으로 확정되어 있어 다시 계산하지 않는다.
alter table public.logs disable trigger user;
update public.logs log
set category = 'stamp',
    action = 'no-stamp',
    note = coalesce(history.note, '반품 보관 손님 서비스'),
    jsonb = jsonb_set(coalesce(log.jsonb, '{}'::jsonb), '{paymentType}', '"remark"'::jsonb, true)
from public.return_hold_processing_history history
where history.action = 'service'
  and history.source_log_id = log.id;
alter table public.logs enable trigger user;
