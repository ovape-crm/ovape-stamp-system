-- 고객 특이사항 편집에서 일반/처리 필요 유형을 바꿀 수 있도록,
-- 미처리 내용 수정과 일반 특이사항 전환 완료 처리를 모두 허용한다.
drop policy if exists "authenticated users can complete customer follow up remarks"
  on public.customer_follow_up_remarks;

create policy "authenticated users can update customer follow up remarks"
on public.customer_follow_up_remarks for update to authenticated
using (not is_completed)
with check (
  (is_completed = false and completed_content is null and completed_at is null)
  or (
    is_completed = true
    and btrim(coalesce(completed_content, '')) <> ''
    and completed_at is not null
    and completed_by = auth.uid()
  )
);
