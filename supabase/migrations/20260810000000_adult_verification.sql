alter table public.customers
  add column if not exists adult_verified boolean not null default false,
  add column if not exists adult_verified_at timestamptz,
  add column if not exists adult_verification_method text,
  add column if not exists adult_verified_by uuid references public.users(id) on delete set null;

alter table public.customers
  drop constraint if exists customers_adult_verification_method_check;

alter table public.customers
  add constraint customers_adult_verification_method_check
  check (
    adult_verification_method is null
    or adult_verification_method in ('bbaton', 'physical_id', 'manual')
  );

create table if not exists public.adult_verification_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint references public.customers(id) on delete set null,
  request_label text not null,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'expired', 'cancelled', 'rejected')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  provider_user_hash text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adult_verification_requests_customer_id_idx
  on public.adult_verification_requests(customer_id, created_at desc);

alter table public.adult_verification_requests enable row level security;

drop policy if exists "staff can read adult verification requests"
on public.adult_verification_requests;

create policy "staff can read adult verification requests"
on public.adult_verification_requests
for select
to authenticated
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.oss_role in ('staff', 'admin')
  )
);

comment on table public.adult_verification_requests is
  '고객별 일회성 성인 인증 링크 상태. 원본 토큰은 저장하지 않고 SHA-256 해시만 저장한다.';

create or replace function public.complete_adult_verification_request(
  p_request_id uuid,
  p_provider_user_hash text,
  p_completed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
  v_updated_count integer;
begin
  update public.adult_verification_requests
  set status = 'completed',
      completed_at = p_completed_at,
      updated_at = p_completed_at,
      provider_user_hash = p_provider_user_hash
  where id = p_request_id
    and status = 'pending'
    and expires_at > p_completed_at
  returning customer_id into v_customer_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count = 0 then
    return false;
  end if;

  if v_customer_id is not null then
    update public.customers
    set adult_verified = true,
        adult_verified_at = p_completed_at,
        adult_verification_method = 'bbaton',
        adult_verified_by = null
    where id = v_customer_id;
  end if;

  return true;
end;
$$;

revoke all on function public.complete_adult_verification_request(uuid, text, timestamptz)
from public, anon, authenticated;

grant execute on function public.complete_adult_verification_request(uuid, text, timestamptz)
to service_role;
