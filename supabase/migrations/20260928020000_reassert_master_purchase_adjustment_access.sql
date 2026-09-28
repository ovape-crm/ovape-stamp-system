-- 마스터는 모든 관리자 권한을 상속한다. 입고 할인·지불 항목 조회가
-- 과거 RLS 정책 상태에 따라 누락되지 않도록 관리자 공통 권한을 재적용한다.
drop policy if exists "admins read purchase adjustment categories"
  on public.inventory_purchase_adjustment_categories;
create policy "admins read purchase adjustment categories"
  on public.inventory_purchase_adjustment_categories for select
  to authenticated using (public.has_admin_access());

drop policy if exists "admins read purchase order adjustments"
  on public.inventory_purchase_order_adjustments;
create policy "admins read purchase order adjustments"
  on public.inventory_purchase_order_adjustments for select
  to authenticated using (public.has_admin_access());
