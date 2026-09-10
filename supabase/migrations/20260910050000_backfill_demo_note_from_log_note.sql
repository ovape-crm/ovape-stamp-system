-- 원가 이벤트와 명세가 없는 기존 시연 기록은 출고 이력의 원문 메모를 보존한다.
update public.settlement_expenses expense
set note = nullif(concat_ws(' · ', nullif(log.note,''), nullif(log.jsonb->>'extraNote','')), ''),
    updated_at = now()
from public.logs log
where expense.category = '시연용'
  and expense.source_log_id = log.id
  and expense.note = '시연 출고 실제 배정 원가'
  and nullif(log.note,'') is not null;
