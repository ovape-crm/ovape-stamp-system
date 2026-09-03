-- Fail closed while replacing the old executor. Existing previews are not real plans.
create or replace function public.apply_inventory_cost_reassignment(p_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.users where id=auth.uid() and oss_role='master') then
    raise exception 'MASTER_REQUIRED';
  end if;
  raise exception '원가 재배정 검증 작업 중입니다. 기존 미리보기는 실행할 수 없습니다.';
end $$;

update public.inventory_cost_reassignment_runs
set status='rejected'
where status in ('previewed','approved');

drop policy if exists "master manages cost reassignment runs" on public.inventory_cost_reassignment_runs;
create policy "master reads cost reassignment runs"
on public.inventory_cost_reassignment_runs for select to authenticated
using (exists(select 1 from public.users where id=auth.uid() and oss_role='master'));
revoke insert, update, delete on public.inventory_cost_reassignment_runs from anon, authenticated;
