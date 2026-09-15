create table if not exists public.comparison_device_defect_symptom_steps (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.comparison_devices(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, step_order)
);

alter table public.comparison_device_defect_symptom_steps enable row level security;
create policy "authenticated reads comparison device defect symptom steps" on public.comparison_device_defect_symptom_steps for select to authenticated using (true);

insert into public.comparison_device_defect_symptom_steps (device_id, step_order, title, content)
select device_id, 1, '불량 증상', content from public.comparison_device_defect_symptoms where btrim(content) <> ''
on conflict (device_id, step_order) do nothing;

create or replace function public.save_comparison_device_defect_symptom_step(p_id uuid, p_device_id uuid, p_step_order integer, p_title text, p_content text)
returns public.comparison_device_defect_symptom_steps language plpgsql security definer set search_path = public as $$
declare v_result public.comparison_device_defect_symptom_steps;
begin
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  if p_id is null then insert into public.comparison_device_defect_symptom_steps(device_id, step_order, title, content) values (p_device_id, p_step_order, p_title, p_content) returning * into v_result;
  else update public.comparison_device_defect_symptom_steps set title = p_title, content = p_content, updated_at = now() where id = p_id and device_id = p_device_id returning * into v_result;
  end if;
  if not found then raise exception 'DEFECT_STEP_NOT_FOUND'; end if;
  return v_result;
end;
$$;

create or replace function public.delete_comparison_device_defect_symptom_step(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  delete from public.comparison_device_defect_symptom_steps where id = p_id;
  if not found then raise exception 'DEFECT_STEP_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.save_comparison_device_defect_symptom_step(uuid, uuid, integer, text, text) from public, anon;
revoke all on function public.delete_comparison_device_defect_symptom_step(uuid) from public, anon;
grant execute on function public.save_comparison_device_defect_symptom_step(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.delete_comparison_device_defect_symptom_step(uuid) to authenticated;
