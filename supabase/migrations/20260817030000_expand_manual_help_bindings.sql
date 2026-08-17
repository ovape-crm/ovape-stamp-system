alter table public.manual_help_bindings
  add column if not exists page_path text,
  add column if not exists target_selector text,
  add column if not exists target_label text,
  add column if not exists display_mode text not null default 'help_button';

alter table public.manual_help_bindings
  drop constraint if exists manual_help_bindings_display_mode_check;

alter table public.manual_help_bindings
  add constraint manual_help_bindings_display_mode_check
  check (display_mode in ('help_button', 'direct_with_help'));

create index if not exists manual_help_bindings_page_path_idx
  on public.manual_help_bindings(page_path);
