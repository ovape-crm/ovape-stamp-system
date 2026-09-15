insert into public.comparison_columns (name, key, sort_order, is_active)
select '기기 불량 증상', 'device_defect_symptoms', coalesce((select max(sort_order) + 1 from public.comparison_columns), 0), true
where not exists (select 1 from public.comparison_columns where key = 'device_defect_symptoms');

create table if not exists public.comparison_device_defect_symptoms (
  device_id uuid primary key references public.comparison_devices(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comparison_device_defect_symptoms enable row level security;

create policy "authenticated reads comparison device defect symptoms"
  on public.comparison_device_defect_symptoms for select to authenticated using (true);

create or replace function public.save_comparison_device_defect_symptom(
  p_device_id uuid,
  p_content text
) returns public.comparison_device_defect_symptoms
language plpgsql security definer set search_path = public as $$
declare v_result public.comparison_device_defect_symptoms;
begin
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  insert into public.comparison_device_defect_symptoms (device_id, content)
  values (p_device_id, coalesce(p_content, ''))
  on conflict (device_id) do update set content = excluded.content, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.save_comparison_device_defect_symptom(uuid, text) from public, anon;
grant execute on function public.save_comparison_device_defect_symptom(uuid, text) to authenticated;
