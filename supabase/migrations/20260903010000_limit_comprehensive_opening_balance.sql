-- 기초 이월은 종합정산 전체에서 한 건만 유지한다.
create unique index comprehensive_settlement_single_opening_balance
  on public.comprehensive_settlement_entries (entry_type)
  where entry_type = 'opening_balance';
