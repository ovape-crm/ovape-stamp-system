create table public.comparison_guide_navigation_settings (
  id text primary key default 'default' check (id = 'default'),
  view_order jsonb not null default '["basic", "customerRequired", "photo", "usage", "defect"]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.comparison_guide_navigation_settings enable row level security;
create policy "authenticated reads comparison guide navigation settings" on public.comparison_guide_navigation_settings for select to authenticated using (true);
create function public.save_comparison_guide_navigation_order(p_view_order jsonb) returns public.comparison_guide_navigation_settings language plpgsql security definer set search_path=public as $$ declare v public.comparison_guide_navigation_settings; begin if not exists(select 1 from public.users where id=auth.uid() and oss_role in ('admin','master')) then raise exception 'ADMIN_REQUIRED'; end if; if jsonb_typeof(p_view_order) <> 'array' then raise exception 'INVALID_VIEW_ORDER'; end if; insert into public.comparison_guide_navigation_settings(id,view_order) values('default',p_view_order) on conflict(id) do update set view_order=excluded.view_order,updated_at=now() returning * into v; return v; end; $$;
revoke all on function public.save_comparison_guide_navigation_order(jsonb) from public,anon;
grant execute on function public.save_comparison_guide_navigation_order(jsonb) to authenticated;
insert into public.comparison_guide_navigation_settings(id) values('default') on conflict(id) do nothing;
