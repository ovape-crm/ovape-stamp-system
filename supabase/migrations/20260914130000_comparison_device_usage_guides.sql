create table if not exists public.comparison_device_usage_guides (
  device_id uuid primary key references public.comparison_devices(id) on delete cascade,
  header_content text not null default '',
  image_url text not null default '',
  image_width_percent integer not null default 70 check (image_width_percent between 20 and 100),
  image_alignment text not null default 'center' check (image_alignment in ('left', 'center', 'right')),
  body_content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comparison_device_usage_guides enable row level security;
create policy "authenticated reads comparison device usage guides"
  on public.comparison_device_usage_guides for select to authenticated using (true);

create or replace function public.save_comparison_device_usage_guide(
  p_device_id uuid,
  p_header_content text,
  p_image_url text,
  p_image_width_percent integer,
  p_image_alignment text,
  p_body_content text
) returns public.comparison_device_usage_guides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guide public.comparison_device_usage_guides;
begin
  if not public.is_current_user_master() then raise exception 'MASTER_REQUIRED'; end if;
  if not exists (select 1 from public.comparison_devices where id = p_device_id) then raise exception 'COMPARISON_DEVICE_NOT_FOUND'; end if;
  if p_image_width_percent not between 20 and 100 then raise exception 'INVALID_IMAGE_WIDTH'; end if;
  if p_image_alignment not in ('left', 'center', 'right') then raise exception 'INVALID_IMAGE_ALIGNMENT'; end if;

  insert into public.comparison_device_usage_guides(device_id, header_content, image_url, image_width_percent, image_alignment, body_content)
  values (p_device_id, coalesce(p_header_content, ''), btrim(coalesce(p_image_url, '')), p_image_width_percent, p_image_alignment, coalesce(p_body_content, ''))
  on conflict (device_id) do update
  set header_content = excluded.header_content,
      image_url = excluded.image_url,
      image_width_percent = excluded.image_width_percent,
      image_alignment = excluded.image_alignment,
      body_content = excluded.body_content,
      updated_at = now()
  returning * into v_guide;
  return v_guide;
end;
$$;

revoke all on function public.save_comparison_device_usage_guide(uuid, text, text, integer, text, text) from public, anon;
grant execute on function public.save_comparison_device_usage_guide(uuid, text, text, integer, text, text) to authenticated;
