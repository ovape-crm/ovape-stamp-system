import supabase from "@/libs/supabaseClient";
import type {
  InventoryEntry,
  InventoryItem,
  InventoryMovement,
  InventoryTrackingSettings,
  InventorySupplier,
  PurchaseAdjustmentCategory,
  PurchaseAdjustmentKind,
  PurchaseOrderAdjustment,
  PurchaseOrder,
} from "../_types/inventory.types";

export const inventoryKeys = {
  all: ["inventory"] as const,
  overview: ["inventory", "overview"] as const,
  movements: ["inventory", "movements"] as const,
  suppliers: ["inventory", "suppliers"] as const,
  purchaseOrders: ["inventory", "purchase-orders"] as const,
  purchaseAdjustmentCategories: [
    "inventory",
    "purchase-adjustment-categories",
  ] as const,
};

export const normalizeInventoryItemName = (value: string) =>
  value.normalize("NFC").trim();

export const getInventoryOverview = async (): Promise<{
  initializedAt: string | null;
  items: InventoryItem[];
}> => {
  const [
    settingsResult,
    itemsResult,
    balancesResult,
    categoryPoliciesResult,
    itemPoliciesResult,
  ] = await Promise.all([
    supabase
      .from("inventory_settings")
      .select("initialized_at")
      .eq("id", true)
      .single(),
    supabase
      .from("items")
      .select("id, item_name, item_code, is_use, item_categories(name)")
      .order("item_name"),
    supabase
      .from("inventory_balances")
      .select("item_name, quantity, updated_at"),
    supabase.from("inventory_category_policies").select("category_name"),
    supabase.from("inventory_item_policies").select("item_name, tracking_mode"),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (balancesResult.error) throw balancesResult.error;
  if (categoryPoliciesResult.error) throw categoryPoliciesResult.error;
  if (itemPoliciesResult.error) throw itemPoliciesResult.error;

  const untrackedCategories = new Set(
    (categoryPoliciesResult.data ?? []).map((row) => row.category_name),
  );
  const itemModes = new Map(
    (itemPoliciesResult.data ?? []).map((row) => [
      normalizeInventoryItemName(row.item_name),
      row.tracking_mode as "tracked" | "untracked",
    ]),
  );

  const balances = new Map(
    (balancesResult.data ?? []).map((balance) => [
      normalizeInventoryItemName(balance.item_name),
      balance,
    ]),
  );

  const items = (itemsResult.data ?? []).map((item) => {
    const itemName = normalizeInventoryItemName(item.item_name);
    const balance = balances.get(itemName);
    const category = Array.isArray(item.item_categories)
      ? item.item_categories[0]
      : item.item_categories;
    balances.delete(itemName);
    const trackingMode: InventoryItem["tracking_mode"] =
      itemModes.get(itemName) ?? "inherit";
    const isTracked =
      trackingMode === "tracked" ||
      (trackingMode === "inherit" &&
        !untrackedCategories.has(category?.name ?? ""));
    return {
      item_id: item.id,
      item_name: itemName,
      item_code: item.item_code,
      category_name: category?.name ?? null,
      quantity: balance?.quantity ?? 0,
      updated_at: balance?.updated_at ?? null,
      is_tracked: isTracked,
      tracking_mode: trackingMode,
      is_use: item.is_use,
    };
  });

  for (const balance of balances.values()) {
    items.push({
      item_id: null,
      item_name: balance.item_name,
      item_code: "",
      category_name: null,
      quantity: balance.quantity,
      updated_at: balance.updated_at,
      is_tracked: true,
      tracking_mode: "inherit",
      is_use: false,
    });
  }

  return { initializedAt: settingsResult.data.initialized_at, items };
};

export const saveInventoryTrackingSettings = async (
  settings: InventoryTrackingSettings,
) => {
  const { error } = await supabase.rpc("save_inventory_tracking_settings_v2", {
    p_untracked_categories: settings.untrackedCategories,
    p_item_modes: Object.entries(settings.itemModes).map(
      ([item_name, tracking_mode]) => ({ item_name, tracking_mode }),
    ),
  });
  if (error) throw error;
};

export type InventoryMovementQuery = {
  startDate?: string;
  endDate?: string;
  itemName?: string;
  movementGroup?: "out" | "in" | "correction";
  limit?: number;
  offset?: number;
  includeUnitPrices?: boolean;
};

export const getInventoryMovementCount = async (options: InventoryMovementQuery = {}) => {
  let query = supabase.from("inventory_movements").select("id", { count: "exact", head: true });
  if (options.startDate) query = query.gte("created_at", `${options.startDate}T00:00:00+09:00`);
  if (options.endDate) query = query.lte("created_at", `${options.endDate}T23:59:59.999+09:00`);
  if (options.itemName?.trim()) query = query.ilike("item_name", `%${options.itemName.trim()}%`);
  if (options.movementGroup === "out") query = query.lt("quantity_delta", 0);
  if (options.movementGroup === "in") query = query.gt("quantity_delta", 0);
  if (options.movementGroup === "correction") query = query.in("movement_type", ["outbound_edit", "outbound_cancel", "reversal"]);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};

export const getInventoryMovements = async (
  options: InventoryMovementQuery = {},
): Promise<InventoryMovement[]> => {
  const pageSize = 1000;
  const movements: InventoryMovement[] = [];
  const requestedLimit = options.limit ?? Number.POSITIVE_INFINITY;
  const initialOffset = options.offset ?? 0;
  for (let from = initialOffset; movements.length < requestedLimit; from += pageSize) {
    let query = supabase
      .from("inventory_movements")
      .select(
        "id, item_name, movement_type, quantity_delta, quantity_after, reference_type, reference_id, reversed_movement_id, note, created_by, created_at, counterparty_name, counterparty_id, inventory_action, item_remark",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (options.startDate) query = query.gte("created_at", `${options.startDate}T00:00:00+09:00`);
    if (options.endDate) query = query.lte("created_at", `${options.endDate}T23:59:59.999+09:00`);
    if (options.itemName?.trim()) query = query.ilike("item_name", `%${options.itemName.trim()}%`);
    if (options.movementGroup === "out") query = query.lt("quantity_delta", 0);
    if (options.movementGroup === "in") query = query.gt("quantity_delta", 0);
    if (options.movementGroup === "correction") query = query.in("movement_type", ["outbound_edit", "outbound_cancel", "reversal"]);
    const to = Math.min(from + pageSize - 1, from + requestedLimit - movements.length - 1);
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    const page = (data ?? []).map((movement) => ({
      ...movement,
      unit_price: null,
    })) as unknown as InventoryMovement[];
    movements.push(...page);
    if (page.length < pageSize || movements.length >= requestedLimit) break;
  }
  if (options.includeUnitPrices && movements.length) {
    const { data, error } = await supabase.rpc(
      "get_inventory_movement_unit_prices",
      { p_movement_ids: movements.map((movement) => movement.id) },
    );
    if (error) throw error;
    const prices = (data ?? {}) as Record<string, number | null>;
    movements.forEach((movement) => {
      movement.unit_price = prices[movement.id] ?? null;
    });
  }
  const outboundLogIds = [
    ...new Set(
      movements
        .filter(
          (movement) =>
            movement.reference_type === "outbound_log" && movement.reference_id,
        )
        .map((movement) => movement.reference_id as string),
    ),
  ];
  const purchaseReceiptIds = [
    ...new Set(
      movements
        .filter(
          (movement) =>
            ["purchase_receipt", "purchase_receipt_reversal"].includes(
              movement.reference_type ?? "",
            ) && movement.reference_id,
        )
        .map((movement) => movement.reference_id as string),
    ),
  ];

  const [outboundResult, receiptResult] = await Promise.all([
    outboundLogIds.length
      ? supabase
          .from("logs")
          .select("id, customer_id, jsonb, customers(name)")
          .in("id", outboundLogIds)
      : Promise.resolve({ data: [], error: null }),
    purchaseReceiptIds.length
      ? supabase
          .from("inventory_purchase_receipts")
          .select(
            "id, order_id, inventory_purchase_orders(inventory_suppliers(name))",
          )
          .in("id", purchaseReceiptIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // 연결 정보가 없는 예전 이력도 계속 표시될 수 있도록 이름 조회 실패는
  // 전체 이력 조회 실패로 처리하지 않고 기존 메모를 대체 정보로 사용한다.
  const outboundNames = new Map<string, string>();
  const outboundCustomerIds = new Map<string, string>();
  const outboundItemDetails = new Map<
    string,
    { inventoryAction: InventoryMovement["inventory_action"]; remark: string }
  >();
  if (!outboundResult.error) {
    for (const row of outboundResult.data ?? []) {
      const customers = Array.isArray(row.customers)
        ? row.customers[0]
        : row.customers;
      if (customers?.name) outboundNames.set(String(row.id), customers.name);
      if (row.customer_id) {
        outboundCustomerIds.set(String(row.id), String(row.customer_id));
      }
      const jsonb = row.jsonb as {
        items?: Array<{
          itemName?: unknown;
          inventoryAction?: unknown;
          remark?: unknown;
        }>;
      } | null;
      for (const item of Array.isArray(jsonb?.items) ? jsonb.items : []) {
        const itemName = normalizeInventoryItemName(
          String(item.itemName ?? ""),
        );
        if (!itemName) continue;
        const action = String(item.inventoryAction ?? "");
        const inventoryAction = [
          "out",
          "exchange_in",
          "exchange_out",
          "adjustment_in",
          "adjustment_out",
        ].includes(action)
          ? (action as InventoryMovement["inventory_action"])
          : null;
        const direction = ["exchange_in", "adjustment_in"].includes(action)
          ? "in"
          : "out";
        outboundItemDetails.set(
          `${row.id}\u0000${itemName}\u0000${direction}`,
          {
            inventoryAction,
            remark: String(item.remark ?? ""),
          },
        );
      }
    }
  }

  const supplierNames = new Map<string, string>();
  const receiptOrderIds = new Map<string, string>();
  if (!receiptResult.error) {
    for (const row of receiptResult.data ?? []) {
      const order = Array.isArray(row.inventory_purchase_orders)
        ? row.inventory_purchase_orders[0]
        : row.inventory_purchase_orders;
      const suppliers = Array.isArray(order?.inventory_suppliers)
        ? order.inventory_suppliers[0]
        : order?.inventory_suppliers;
      if (suppliers?.name) supplierNames.set(String(row.id), suppliers.name);
      if (row.order_id) {
        receiptOrderIds.set(String(row.id), String(row.order_id));
      }
    }
  }

  return movements.map((movement) => {
    const itemDetail = outboundItemDetails.get(
      `${movement.reference_id ?? ""}\u0000${normalizeInventoryItemName(movement.item_name)}\u0000${movement.quantity_delta > 0 ? "in" : "out"}`,
    );
    return {
      ...movement,
      counterparty_name:
        movement.reference_type === "outbound_log"
          ? (outboundNames.get(movement.reference_id ?? "") ??
            movement.counterparty_name ??
            null)
          : ["purchase_receipt", "purchase_receipt_reversal"].includes(
                movement.reference_type ?? "",
              )
            ? (supplierNames.get(movement.reference_id ?? "") ?? null)
            : null,
      counterparty_id:
        movement.reference_type === "outbound_log"
          ? (outboundCustomerIds.get(movement.reference_id ?? "") ??
            movement.counterparty_id ??
            null)
          : null,
      purchase_order_id: [
        "purchase_receipt",
        "purchase_receipt_reversal",
      ].includes(movement.reference_type ?? "")
        ? (receiptOrderIds.get(movement.reference_id ?? "") ?? null)
        : null,
      inventory_action:
        itemDetail?.inventoryAction ?? movement.inventory_action ?? null,
      item_remark: itemDetail?.remark ?? movement.item_remark ?? null,
    };
  });
};

export const initializeInventory = async (entries: InventoryEntry[]) => {
  const { error } = await supabase.rpc("initialize_inventory", {
    p_items: entries.map((entry) => ({
      item_name: normalizeInventoryItemName(entry.item_name),
      quantity: entry.quantity,
    })),
  });
  if (error) throw error;
};

export const addInitialInventoryEntries = async (entries: InventoryEntry[]) => {
  const { error } = await supabase.rpc("add_initial_inventory_entries", {
    p_items: entries.map((entry) => ({
      item_name: normalizeInventoryItemName(entry.item_name),
      quantity: entry.quantity,
    })),
  });
  if (error) throw error;
};

export const resetInventoryForReinitialization = async () => {
  const { error } = await supabase.rpc("reset_inventory_for_reinitialization");
  if (error) throw error;
};

export const receiveInventory = async (
  entries: InventoryEntry[],
  note: string,
) => {
  const { error } = await supabase.rpc("receive_inventory", {
    p_items: entries.map((entry) => ({
      item_name: normalizeInventoryItemName(entry.item_name),
      quantity: entry.quantity,
      unit_price: entry.unit_price ?? null,
    })),
    p_note: note.trim() || null,
  });
  if (error) throw error;
};

export const reverseInventoryMovement = async (movementId: string) => {
  const { error } = await supabase.rpc("reverse_inventory_movement", {
    p_movement_id: movementId,
    p_note: "입고 취소",
  });
  if (error) throw error;
};

export const getInventorySuppliers = async (
  isAdmin = false,
): Promise<InventorySupplier[]> => {
  const { data, error } = await supabase
    .from("inventory_suppliers")
    .select(isAdmin ? "*" : "id, name, note, is_use")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as InventorySupplier[];
};
export const saveInventorySupplier = async (
  id: string | null,
  data: Omit<InventorySupplier, "id">,
) => {
  const { data: savedId, error } = await supabase.rpc(
    "save_inventory_supplier",
    {
      p_id: id,
      p_data: data,
    },
  );
  if (error) throw error;
  return savedId as string;
};
const attachPurchaseOrderUnitPrices = async (
  orders: PurchaseOrder[],
  isMaster: boolean,
): Promise<PurchaseOrder[]> => {
  if (!isMaster) return orders;
  const lineIds = orders.flatMap((order) =>
    order.inventory_purchase_order_lines.map((line) => line.id),
  );
  if (!lineIds.length) return orders;
  const { data, error } = await supabase.rpc(
    "get_inventory_purchase_order_unit_prices",
    { p_line_ids: lineIds },
  );
  if (error) throw error;
  const prices = (data ?? {}) as Record<string, number | null>;
  return orders.map((order) => ({
    ...order,
    inventory_purchase_order_lines: order.inventory_purchase_order_lines.map(
      (line) => ({ ...line, unit_price: prices[line.id] ?? null }),
    ),
  }));
};

export const getPurchaseOrders = async (
  isMaster = false,
): Promise<PurchaseOrder[]> => {
  const lineColumns =
    "id, order_id, item_name, ordered_quantity, received_quantity, pending_quantity, note, quantity_checked_by, quantity_check_note, quantity_checked_at, handling_type, handling_note, customer_id, reservation_log_id, after_service_id, inbound_type";
  const { data, error } = await supabase
    .from("inventory_purchase_orders")
    .select(
      `*, inventory_suppliers(name), inventory_purchase_order_lines(${lineColumns}, customers(name, phone)), inventory_purchase_receipts(id, after_service_id, arrived_on, note, created_at, reversed_at, inventory_purchase_receipt_lines(id, order_line_id, item_name, quantity, note, quantity_check_note)), inventory_purchase_order_adjustments(id, category_id, category_name, kind, amount, note)`,
    )
    .order("created_at", { ascending: false });
  if (!error)
    return attachPurchaseOrderUnitPrices(
      (data ?? []) as unknown as PurchaseOrder[],
      isMaster,
    );

  // Some environments can already have the handling columns while optional
  // adjustment / receipt-note migrations are still pending. Keep the saved
  // handling state instead of falling all the way back to `none`.
  const compatibleLineColumns =
    "id, order_id, item_name, ordered_quantity, received_quantity, pending_quantity, note, quantity_checked_at, handling_type, handling_note, customer_id, reservation_log_id, after_service_id, inbound_type";
  const { data: compatibleData, error: compatibleError } = await supabase
    .from("inventory_purchase_orders")
    .select(
      `*, inventory_suppliers(name), inventory_purchase_order_lines(${compatibleLineColumns}, customers(name, phone)), inventory_purchase_receipts(id, after_service_id, arrived_on, note, created_at, reversed_at, inventory_purchase_receipt_lines(id, order_line_id, item_name, quantity, note))`,
    )
    .order("created_at", { ascending: false });
  if (!compatibleError) {
    const compatibleOrders = (compatibleData ?? []).map((order) => ({
      ...order,
      inventory_purchase_order_adjustments: [],
      inventory_purchase_receipts: order.inventory_purchase_receipts.map(
        (receipt: {
          inventory_purchase_receipt_lines: Record<string, unknown>[];
          [key: string]: unknown;
        }) => ({
          ...receipt,
          inventory_purchase_receipt_lines:
            receipt.inventory_purchase_receipt_lines.map(
              (line: Record<string, unknown>) => ({
                ...line,
                quantity_check_note: null,
              }),
            ),
        }),
      ),
    })) as unknown as PurchaseOrder[];
    return attachPurchaseOrderUnitPrices(compatibleOrders, isMaster);
  }

  // 신규 메모 열을 아직 적용하지 않은 DB에서도 입고 목록은 계속 표시한다.
  const legacyLineColumns =
    "id, order_id, item_name, ordered_quantity, received_quantity, pending_quantity, note, quantity_checked_at";
  const { data: legacyData, error: legacyError } = await supabase
    .from("inventory_purchase_orders")
    .select(
      `*, inventory_suppliers(name), inventory_purchase_order_lines(${legacyLineColumns}), inventory_purchase_receipts(id, after_service_id, arrived_on, note, created_at, reversed_at, inventory_purchase_receipt_lines(id, order_line_id, item_name, quantity))`,
    )
    .order("created_at", { ascending: false });
  if (legacyError) throw legacyError;
  const legacyOrders = (legacyData ?? []).map((order) => ({
    ...order,
    inventory_purchase_order_adjustments: [],
    inventory_purchase_order_lines: order.inventory_purchase_order_lines.map(
      (line: Record<string, unknown>) => ({
        ...line,
        quantity_check_note: null,
        handling_type: "none",
        handling_note: null,
        customer_id: null,
        reservation_log_id: null,
      }),
    ),
    inventory_purchase_receipts: order.inventory_purchase_receipts.map(
      (receipt: {
        inventory_purchase_receipt_lines: Record<string, unknown>[];
        [key: string]: unknown;
      }) => ({
        ...receipt,
        inventory_purchase_receipt_lines:
          receipt.inventory_purchase_receipt_lines.map(
            (line: Record<string, unknown>) => ({
              ...line,
              note: null,
              quantity_check_note: null,
            }),
          ),
      }),
    ),
  })) as unknown as PurchaseOrder[];
  return attachPurchaseOrderUnitPrices(legacyOrders, isMaster);
};

export const getPurchaseAdjustmentCategories = async (
  includeInactive = false,
): Promise<PurchaseAdjustmentCategory[]> => {
  let query = supabase
    .from("inventory_purchase_adjustment_categories")
    .select("id, name, kind, sort_order, is_active")
    .order("kind")
    .order("sort_order")
    .order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PurchaseAdjustmentCategory[];
};

export const savePurchaseAdjustmentCategory = async (values: {
  id?: string;
  name: string;
  kind: PurchaseAdjustmentCategory["kind"];
}): Promise<void> => {
  const { error } = await supabase.rpc(
    "save_inventory_purchase_adjustment_category",
    {
      p_id: values.id ?? null,
      p_name: values.name.trim(),
      p_kind: values.kind,
    },
  );
  if (error) throw error;
};

export const deactivatePurchaseAdjustmentCategory = async (
  id: string,
): Promise<void> => {
  const { error } = await supabase.rpc(
    "deactivate_inventory_purchase_adjustment_category",
    { p_id: id },
  );
  if (error) throw error;
};

export const savePurchaseOrderAdjustments = async (
  orderId: string,
  adjustments: Array<
    Pick<
      PurchaseOrderAdjustment,
      "category_id" | "category_name" | "kind" | "amount" | "note"
    >
  >,
): Promise<void> => {
  const { error } = await supabase.rpc(
    "save_inventory_purchase_order_adjustments",
    {
      p_order_id: orderId,
      p_adjustments: adjustments,
    },
  );
  if (error) throw error;
};

export const updatePurchaseOrderDetails = async (values: {
  orderId: string;
  supplierId: string;
  orderedOn: string;
  note: string;
  lines: Array<{
    id: string | null;
    item_name: string;
    ordered_quantity: number;
    unit_price: number | null;
    note: string;
    handling_type:
      | "none"
      | "demo"
      | "reservation"
      | "customer"
      | "memo"
      | "as_exchange_in";
    handling_note: string | null;
    customer_id: string | null;
    reservation_log_id: string | null;
  }>;
  receipts: Array<{
    id: string;
    arrived_on: string;
    note: string;
  }>;
}): Promise<void> => {
  const { error } = await supabase.rpc(
    "update_inventory_purchase_order_details",
    {
      p_order_id: values.orderId,
      p_supplier_id: values.supplierId,
      p_ordered_on: values.orderedOn,
      p_note: values.note || null,
      p_lines: values.lines,
      p_receipts: values.receipts,
    },
  );
  if (error) throw error;
};
export const createPurchaseOrder = async (
  supplierId: string,
  orderedOn: string,
  note: string,
  lines: Array<{
    item_name: string;
    quantity: number;
    unit_price: number | null;
    note: string;
    handling_type:
      | "none"
      | "demo"
      | "reservation"
      | "customer"
      | "memo"
      | "as_exchange_in";
    handling_note: string | null;
    customer_id: string | null;
    reservation_log_id: string | null;
  }>,
  adjustments: Array<{
    category_id: string | null;
    category_name: string;
    kind: PurchaseAdjustmentKind;
    amount: number;
    note: string | null;
  }> = [],
) => {
  const { data, error } = await supabase.rpc(
    "create_inventory_purchase_order",
    {
      p_supplier_id: supplierId,
      p_ordered_on: orderedOn,
      p_note: note || null,
      p_lines: lines,
      p_adjustments: adjustments,
    },
  );
  if (error) throw error;
  return data as string;
};

export type ReservationCustomer = {
  id: string;
  name: string;
  phone: string;
};

export type ReservationHistory = {
  id: string;
  customer_id: string;
  created_at: string;
  note: string;
  jsonb: Record<string, unknown>;
};

export const searchReservationCustomers = async (
  keyword: string,
): Promise<ReservationCustomer[]> => {
  const normalized = keyword.trim();
  if (!normalized) return [];
  const safeKeyword = normalized.replace(/[,%()]/g, " ").trim();
  if (!safeKeyword) return [];
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone")
    .or(`name.ilike.%${safeKeyword}%,phone.ilike.%${safeKeyword}%`)
    .limit(20);
  if (error) throw error;
  return (data ?? []) as ReservationCustomer[];
};

export const getCustomerReservationHistories = async (
  customerId: string,
): Promise<ReservationHistory[]> => {
  if (!customerId) return [];
  const { data, error } = await supabase
    .from("logs")
    .select("id, customer_id, created_at, note, jsonb")
    .eq("customer_id", customerId)
    .eq("category", "reservation")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as ReservationHistory[];
};
export const setPurchaseArrivalQuantity = async (
  lineId: string,
  quantity: number,
) => {
  const { error } = await supabase.rpc("set_purchase_arrival_quantity", {
    p_line_id: lineId,
    p_quantity: quantity,
  });
  if (error) throw error;
};

export const updatePurchaseOrderQuantity = async (
  lineId: string,
  quantity: number,
) => {
  const { error } = await supabase.rpc("update_purchase_order_quantity", {
    p_line_id: lineId,
    p_quantity: quantity,
  });
  if (error) throw error;
};
export const checkPurchaseArrivalQuantity = async (lineId: string) => {
  const { error } = await supabase.rpc("check_purchase_arrival_quantity", {
    p_line_id: lineId,
  });
  if (error) throw error;
};
export const processPurchaseArrival = async (
  orderId: string,
  arrivedOn: string,
  note: string,
) => {
  const { error } = await supabase.rpc("process_purchase_arrival", {
    p_order_id: orderId,
    p_arrived_on: arrivedOn,
    p_note: note || null,
  });
  if (error) throw error;
};
export const closePurchaseOrderRemainder = async (
  orderId: string,
  reason: string,
) => {
  const { error } = await supabase.rpc("close_purchase_order_remainder", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;
};
export const reversePurchaseReceipt = async (
  receiptId: string,
  reason: string,
) => {
  const { error } = await supabase.rpc("reverse_purchase_receipt", {
    p_receipt_id: receiptId,
    p_reason: reason,
  });
  if (error) throw error;
};
export const deletePurchaseOrderHistory = async (orderId: string) => {
  const { error } = await supabase.rpc("delete_purchase_order_history", {
    p_order_id: orderId,
  });
  if (error) throw error;
};
