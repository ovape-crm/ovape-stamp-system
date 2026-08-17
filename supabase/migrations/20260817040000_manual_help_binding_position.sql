alter table public.manual_help_bindings
  add column if not exists position text not null default 'inside_right';

alter table public.manual_help_bindings
  drop constraint if exists manual_help_bindings_position_check;

alter table public.manual_help_bindings
  add constraint manual_help_bindings_position_check
  check (position in ('inside_right', 'outside_right', 'outside_left', 'top_right'));
