-- 2026-08-28 박태일 예약 주문 확정 건을 2026-08-29의 마지막 출고 다음으로 정렬한다.
with target_log as (
  select log.id
  from public.logs log
  join public.customers customer on customer.id = log.customer_id
  where customer.name = '박태일'
    and customer.phone = '01086033009'
    and log.category = 'stamp'
    and log.note like '(8/28 예약주문)%'
  order by log.created_at desc
  limit 1
)
update public.logs log
set created_at = timestamptz '2026-08-29 12:57:00+00'
from target_log
where log.id = target_log.id;
