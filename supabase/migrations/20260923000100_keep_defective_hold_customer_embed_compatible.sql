-- Keep the existing customer embed unambiguous for deployed clients while the
-- service customer is validated by the processing RPC.
alter table public.defective_inventory_holds
  drop constraint if exists defective_inventory_holds_service_customer_id_fkey;
