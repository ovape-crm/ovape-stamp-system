create table if not exists public.inventory_tax_invoice_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.inventory_tax_invoice_options (name, sort_order)
values
  ('오베이프 세금계산서', 10), ('이구베이프 세금계산서', 20),
  ('오베이프 현금영수증', 30), ('이구베이프 현금영수증', 40), ('X', 50)
on conflict (name) do nothing;

alter table public.inventory_tax_invoice_options enable row level security;
create policy "authenticated users read tax invoice options" on public.inventory_tax_invoice_options for select to authenticated using (true);
create policy "admins manage tax invoice options" on public.inventory_tax_invoice_options for all to authenticated using (
  exists (select 1 from public.users where users.id = auth.uid() and users.oss_role in ('admin','master'))
) with check (
  exists (select 1 from public.users where users.id = auth.uid() and users.oss_role in ('admin','master'))
);
