-- 시연용·재고조정 계정은 고객 성별이 아닌 특수계정 분류로 표시한다.
update public.customers
set gender = 'special'
where name in ('시연용', '재고조정')
  and gender is distinct from 'special';
