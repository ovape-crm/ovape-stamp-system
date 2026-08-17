alter table public.after_services
  add column if not exists customer_purchase_date text,
  add column if not exists customer_received_date text,
  add column if not exists supplier_name text,
  add column if not exists has_after_service_cost boolean not null default false,
  add column if not exists after_service_payment_method text,
  add column if not exists after_service_cost_amount integer,
  add column if not exists after_service_cost_memo text,
  add column if not exists is_rental_issued boolean not null default false,
  add column if not exists rental_date text,
  add column if not exists rental_note text,
  add column if not exists is_exchange_issued boolean not null default false,
  add column if not exists exchange_date text,
  add column if not exists exchange_item_id text,
  add column if not exists exchange_item_name text,
  add column if not exists exchange_item_category_name text,
  add column if not exists exchange_quantity integer,
  add column if not exists exchange_note text;

alter table public.after_services
  drop constraint if exists after_services_payment_method_check;
alter table public.after_services
  add constraint after_services_payment_method_check
  check (
    after_service_payment_method is null
    or after_service_payment_method in ('card', 'transfer', 'cash')
  );
