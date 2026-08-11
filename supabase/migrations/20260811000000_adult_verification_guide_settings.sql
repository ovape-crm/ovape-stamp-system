create table if not exists public.adult_verification_guide_settings (
  id text primary key default 'default' check (id = 'default'),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

alter table public.adult_verification_guide_settings enable row level security;

drop policy if exists "authenticated users can read adult verification guide settings"
on public.adult_verification_guide_settings;
create policy "authenticated users can read adult verification guide settings"
on public.adult_verification_guide_settings for select
to authenticated
using (true);

drop policy if exists "admins can save adult verification guide settings"
on public.adult_verification_guide_settings;
create policy "admins can save adult verification guide settings"
on public.adult_verification_guide_settings for all
to authenticated
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid() and users.oss_role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid() and users.oss_role = 'admin'
  )
);

insert into public.adult_verification_guide_settings (id, steps)
values (
  'default',
  '["인증 링크 생성 후 고객에게 발송", "인증 완료 시 고객 추가 및 연동", "결제 진행"]'::jsonb
)
on conflict (id) do nothing;
