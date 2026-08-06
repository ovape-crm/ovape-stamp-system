export type InventoryStatus = "normal" | "out" | "negative";

export type InventoryItem = {
  item_name: string;
  item_code: string;
  category_name: string | null;
  quantity: number;
  updated_at: string | null;
  is_tracked: boolean;
  tracking_mode: "inherit" | "tracked" | "untracked";
  is_use: boolean;
};

export type InventoryTrackingSettings = {
  untrackedCategories: string[];
  itemModes: Record<string, "tracked" | "untracked">;
};

export type InventoryMovement = {
  id: string;
  item_name: string;
  movement_type:
    | "initial"
    | "purchase_in"
    | "adjustment"
    | "reversal"
    | "sale_out"
    | "exchange_in"
    | "outbound_edit"
    | "outbound_cancel";
  quantity_delta: number;
  quantity_after: number;
  unit_price: number | null;
  reference_type: string | null;
  reference_id: string | null;
  reversed_movement_id: string | null;
  note: string | null;
  created_at: string;
  counterparty_name?: string | null;
  counterparty_id?: string | null;
  purchase_order_id?: string | null;
  inventory_action?:
    | "out"
    | "exchange_in"
    | "exchange_out"
    | "adjustment_in"
    | "adjustment_out"
    | null;
  item_remark?: string | null;
  users?: { name: string | null } | null;
};

export type InventoryEntry = {
  item_name: string;
  quantity: number;
  unit_price?: number | null;
};

export type InventorySupplier = {
  id: string;
  name: string;
  customer_service_phone: string | null;
  as_center_phone: string | null;
  courier_company: string | null;
  order_cutoff_time: string | null;
  note: string | null;
  is_use: boolean;
};
export type PurchaseOrderLine = {
  id: string;
  item_name: string;
  ordered_quantity: number;
  received_quantity: number;
  pending_quantity: number;
  unit_price: number | null;
  note: string | null;
  quantity_check_note: string | null;
  quantity_checked_at: string | null;
  handling_type: "none" | "demo" | "reservation" | "memo";
  handling_note: string | null;
  customer_id: string | null;
  reservation_log_id: string | null;
};
export type PurchaseReceipt = {
  id: string;
  arrived_on: string;
  note: string | null;
  created_at: string;
  reversed_at: string | null;
  inventory_purchase_receipt_lines: {
    id: string;
    order_line_id: string;
    item_name: string;
    quantity: number;
    note: string | null;
    quantity_check_note: string | null;
  }[];
};
export type PurchaseAdjustmentKind = "discount" | "payment";
export type PurchaseAdjustmentCategory = {
  id: string;
  name: string;
  kind: PurchaseAdjustmentKind;
  sort_order: number;
  is_active: boolean;
};
export type PurchaseOrderAdjustment = {
  id: string;
  category_id: string | null;
  category_name: string;
  kind: PurchaseAdjustmentKind;
  amount: number;
  note: string | null;
};
export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  ordered_on: string;
  status: "pending" | "partial" | "completed" | "closed" | "cancelled";
  note: string | null;
  closed_reason: string | null;
  created_at: string;
  inventory_suppliers: { name: string } | null;
  inventory_purchase_order_lines: PurchaseOrderLine[];
  inventory_purchase_receipts: PurchaseReceipt[];
  inventory_purchase_order_adjustments: PurchaseOrderAdjustment[];
};
