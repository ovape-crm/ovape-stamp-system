delete from public.settlement_expenses expense
using public.logs log
where expense.source_log_id = log.id
  and expense.category in ('택배비', '배달대행비')
  and (log.created_at at time zone 'Asia/Seoul')::date < date '2026-08-02';
