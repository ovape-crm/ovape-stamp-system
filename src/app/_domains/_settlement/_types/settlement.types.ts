export type SettlementStore = "ovape" | "eguvape" | "common" | "other";

export type SettlementExpense = {
  id: string;
  expense_date: string;
  category: string;
  category_id: string | null;
  amount: number;
  store: SettlementStore;
  is_recurring: boolean;
  recurrence_day: number | null;
  recurrence_end_date: string | null;
  recurrence_cancelled_on: string | null;
  note: string | null;
  created_at: string;
};

export type SettlementExpenseCategory = {
  id: string;
  name: string;
};

export type StorePaymentSales = Record<string, number>;

export type SettlementSummary = {
  sales: { ovape: StorePaymentSales; eguvape: StorePaymentSales };
  purchases: { ovape: number; eguvape: number; other: number };
};

export type SettlementCostBasisType = "historical" | "opening_20260722";

export type SettlementCostSegment = {
  quantity: number;
  unitCost: number;
  sortOrder: number;
};

export type SettlementSoldItem = {
  itemId: number | null;
  itemName: string;
  soldBeforeBaseline: number;
  soldAfterBaseline: number;
  openingQuantity: number;
  currentItemStatus: "active" | "inactive" | "missing";
  historicalSegments: SettlementCostSegment[];
  openingSegments: SettlementCostSegment[];
};

export type SettlementHistoricalPurchase = {
  id: string;
  order_date: string;
  store: "ovape" | "eguvape" | "other";
  invoice_type: "tax_invoice" | "cash_receipt" | "x";
  supplier_id: string;
  total_amount: number;
  purchase_amount: number;
  supplier_discount: number;
  wholesale_shipping_fee: number;
  points_used: number;
  paid_amount: number;
  note: string | null;
  inventory_suppliers: { name: string } | null;
};
