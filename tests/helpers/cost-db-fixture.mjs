import { readFile } from "node:fs/promises";
export const master = "00000000-0000-0000-0000-000000000001";
const sqlFile = (name) =>
  readFile(
    new URL(`../../supabase/migrations/${name}.sql`, import.meta.url),
    "utf8",
  );
export async function initializeCostTestDb(db) {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.users(id uuid primary key,oss_role text,created_at timestamptz default now());
    insert into auth.users values ('${master}');
    insert into public.users(id,oss_role) values ('${master}','master');
    grant select on public.users to authenticated;
    create table public.items(id bigint primary key,item_name text,created_at timestamptz default now());
    create table public.inventory_balances(item_name text primary key,quantity integer,updated_at timestamptz default now());
    create table public.after_service_outbound_cost_allocations(id uuid primary key default gen_random_uuid(),after_service_id bigint,source_receipt_line_id uuid,unit_price integer,outbound_quantity integer,received_quantity integer default 0,created_at timestamptz default now());
    create table public.settlement_expenses(id uuid primary key,source_log_id bigint,amount integer,category text);
    create table public.inventory_purchase_receipts(id uuid primary key,arrived_on date,reversed_at timestamptz,order_id uuid);
    create table public.inventory_purchase_receipt_lines(id uuid primary key,receipt_id uuid,order_line_id uuid,item_name text,quantity integer,unit_price integer,demo_quantity integer default 0);
    create table public.inventory_purchase_order_lines(id uuid primary key,received_quantity integer,pending_quantity integer,ordered_quantity integer);
    create table public.inventory_movements(id uuid primary key default gen_random_uuid(),item_name text,movement_type text,quantity_delta integer,quantity_after integer,unit_price integer,reference_type text,reference_id text,note text,created_by uuid,inventory_action text,item_remark text);
    create table public.after_services(id bigint primary key,customer_id bigint,item_name text,quantity integer,service_case_type text,outbound_supplier_id uuid,outbound_processed_at timestamptz,status text);
    create table public.logs(id bigint primary key,category text,jsonb jsonb,created_at timestamptz default now(),customer_id bigint,after_service_id bigint);
    create table public.customers(id bigint primary key,name text,phone text,created_at timestamptz default now());
    alter table public.logs add column admin_id uuid;
    alter table public.inventory_movements add column created_at timestamptz default now(), add column reversed_movement_id uuid;
    create table public.settlement_expense_categories(id uuid primary key default gen_random_uuid(),name text unique,is_active boolean,created_by uuid);
    alter table public.settlement_expenses alter column id set default gen_random_uuid();
    alter table public.settlement_expenses add column expense_date date,add column category_id uuid,add column store text,add column is_recurring boolean,add column note text,add column created_by uuid,add column updated_at timestamptz default now();
    create unique index on public.settlement_expenses(source_log_id) where source_log_id is not null and category='고객 교환 원가차액';
    create table public.inventory_purchase_orders(id uuid primary key default gen_random_uuid(),supplier_id uuid,status text,note text,created_by uuid,updated_at timestamptz default now());
    alter table public.inventory_purchase_order_lines add column item_name text,add column unit_price integer,add column inbound_type text,add column after_service_id bigint,add column handling_type text,add column handling_note text,add column demo_quantity integer default 0,add column order_id uuid,add column quantity_checked_at timestamptz,add column quantity_checked_by uuid,add column quantity_check_note text,add column note text;
    create function public.is_inventory_item_tracked(text) returns boolean language sql stable as $$ select true $$;
  `);
  for (const file of [
    "20260826050000_inventory_cost_ledger_foundation",
    "20260903040000_inventory_cost_reassignment_audit",
    "20260903050000_apply_scoped_inventory_cost_reassignment",
    "20260903060000_store_cost_reassignment_preview_lines",
    "20260903070000_pause_unverified_cost_reassignment",
    "20260903080000_verified_inventory_cost_reassignment",
    "20260827092000_sync_purchase_cost_edits_to_fifo",
    "20260827094000_sync_purchase_receipt_quantity_edits",
    "20260826150000_rollback_receipt_cost_layers",
    "20260903090000_guard_inventory_cost_sources",
    "20260903100000_connect_service_fifo_costs",
    "20260903110000_inventory_cost_integrity_report",
    "20260903120000_preserve_cost_source_identity",
    "20260903130000_link_historical_service_costs",
    "20260903140000_show_service_context_restoration",
    "20260903150000_close_inventory_cost_route_gaps",
    "20260903160000_manual_service_cost_entries",
    "20260903170000_preserve_manual_service_cost_on_log_edits",
    "20260903180000_review_manual_service_cost_postings",
    "20260903190000_attribute_reviewed_service_cost_once",
    "20260903200000_exclude_untracked_item_costs",
    "20260903210000_only_unresolved_service_cost_attention",
    "20260903220000_cleanup_cancelled_outbound_missing_layers",
  ])
    await db.exec(await sqlFile(file));
  await db.exec(`
    create trigger restore_inventory_service_outbound_on_as_delete_trigger before delete on public.after_services for each row when (old.outbound_processed_at is not null) execute function public.restore_inventory_service_outbound_on_as_delete();
  `);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    master,
  ]);
}
