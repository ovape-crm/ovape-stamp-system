alter table public.settlement_historical_purchases
  add column if not exists purchase_amount integer not null default 0,
  add column if not exists supplier_discount integer not null default 0,
  add column if not exists wholesale_shipping_fee integer not null default 0,
  add column if not exists points_used integer not null default 0,
  add column if not exists paid_amount integer not null default 0;

update public.settlement_historical_purchases
set purchase_amount = total_amount,
    paid_amount = total_amount
where purchase_amount = 0
  and supplier_discount = 0
  and wholesale_shipping_fee = 0
  and points_used = 0;

alter table public.settlement_historical_purchases
  drop constraint if exists settlement_historical_purchases_store_check,
  add constraint settlement_historical_purchases_store_check check (store in ('ovape', 'eguvape', 'other')),
  drop constraint if exists settlement_historical_purchases_purchase_amount_check,
  add constraint settlement_historical_purchases_purchase_amount_check check (purchase_amount >= 0),
  drop constraint if exists settlement_historical_purchases_supplier_discount_check,
  add constraint settlement_historical_purchases_supplier_discount_check check (supplier_discount >= 0),
  drop constraint if exists settlement_historical_purchases_wholesale_shipping_fee_check,
  add constraint settlement_historical_purchases_wholesale_shipping_fee_check check (wholesale_shipping_fee >= 0),
  drop constraint if exists settlement_historical_purchases_points_used_check,
  add constraint settlement_historical_purchases_points_used_check check (points_used >= 0),
  drop constraint if exists settlement_historical_purchases_paid_amount_check,
  add constraint settlement_historical_purchases_paid_amount_check check (paid_amount >= 0);
