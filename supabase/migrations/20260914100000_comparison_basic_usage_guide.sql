create table if not exists public.comparison_usage_guide_steps (
  id uuid primary key default gen_random_uuid(),
  step_order integer not null unique,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.comparison_device_usage_notes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.comparison_devices(id) on delete cascade,
  step_id uuid not null references public.comparison_usage_guide_steps(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(device_id, step_id)
);
alter table public.comparison_usage_guide_steps enable row level security;
alter table public.comparison_device_usage_notes enable row level security;
create policy "authenticated reads comparison usage steps" on public.comparison_usage_guide_steps for select to authenticated using (true);
create policy "authenticated reads comparison usage notes" on public.comparison_device_usage_notes for select to authenticated using (true);
insert into public.comparison_columns(name,key,sort_order,is_active)
select '기초 사용법','basic_usage_guide',coalesce((select max(sort_order)+1 from public.comparison_columns),0),true
where not exists (select 1 from public.comparison_columns where key='basic_usage_guide');
insert into public.comparison_usage_guide_steps(step_order,title,content) values
 (1,'준비','구성품과 충전 상태를 확인합니다.'),
 (2,'액상·팟 준비','기기 방식에 맞게 팟 또는 탱크를 결합하고 액상을 준비합니다.'),
 (3,'첫 사용','새 팟·코일은 액상이 충분히 스며들도록 기다린 뒤 사용합니다.'),
 (4,'사용·관리','탄맛·누수 등 이상이 있으면 사용을 멈추고 팟·코일 상태를 확인합니다.')
on conflict (step_order) do nothing;
