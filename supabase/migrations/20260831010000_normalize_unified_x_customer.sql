-- 이미 적용된 통합 X 고객 레코드를 새 표기와 성별 분류로 정규화한다.
update public.customers
set
  name = 'X',
  gender = 'special',
  note = '통합 X 고객 특수계정. 성별은 각 출고 이력에서 확인합니다.'
where name = 'X 고객' and phone = 'X';
