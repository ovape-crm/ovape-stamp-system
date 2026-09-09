-- 고객 특이사항 중 후속 처리가 필요한 건은 일반 로그와 분리해 미처리 현황에서도 관리한다.
create table if not exists public.customer_follow_up_remarks (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customers(id) on delete cascade,
  content text not null check (btrim(content) <> ''),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_by_name text not null default '직원',
  created_at timestamptz not null default now(),
  is_completed boolean not null default false,
  completed_content text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_by_name text,
  completed_at timestamptz,
  constraint customer_follow_up_remarks_completion_check check (
    (is_completed = false and completed_content is null and completed_at is null)
    or (is_completed = true and btrim(coalesce(completed_content, '')) <> '' and completed_at is not null)
  )
);

create index if not exists customer_follow_up_remarks_open_idx
  on public.customer_follow_up_remarks (is_completed, created_at asc);
create index if not exists customer_follow_up_remarks_customer_idx
  on public.customer_follow_up_remarks (customer_id, created_at desc);

alter table public.customer_follow_up_remarks enable row level security;

create policy "authenticated users can read customer follow up remarks"
on public.customer_follow_up_remarks for select to authenticated using (true);
create policy "authenticated users can add customer follow up remarks"
on public.customer_follow_up_remarks for insert to authenticated
with check (created_by = auth.uid());
create policy "authenticated users can complete customer follow up remarks"
on public.customer_follow_up_remarks for update to authenticated
using (not is_completed) with check (is_completed = true and completed_by = auth.uid());

-- 기존에 표시·검색되는 업무 명칭도 새 이름으로 정리한다.
update public.logs
set action = replace(replace(action, '업체 교환출고', '업체 불량교환'), '매장제품 A/S 출고', '매장제품 A/S'),
    note = replace(replace(note, '업체 교환출고', '업체 불량교환'), '매장제품 A/S 출고', '매장제품 A/S')
where action like '%업체 교환출고%'
   or action like '%매장제품 A/S 출고%'
   or note like '%업체 교환출고%'
   or note like '%매장제품 A/S 출고%';

update public.inventory_movements
set note = replace(replace(note, '업체 교환출고', '업체 불량교환'), '매장제품 A/S 출고', '매장제품 A/S'),
    item_remark = replace(replace(item_remark, '업체 교환출고', '업체 불량교환'), '매장제품 A/S 출고', '매장제품 A/S')
where note like '%업체 교환출고%'
   or note like '%매장제품 A/S 출고%'
   or item_remark like '%업체 교환출고%'
   or item_remark like '%매장제품 A/S 출고%';
