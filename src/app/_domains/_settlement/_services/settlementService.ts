import supabase from "@/libs/supabaseClient";
import { aggregatePaymentSales } from "@/app/_domains/_settlement/_utils/paymentSales";
import {
  getInventoryOverview,
  normalizeInventoryItemName,
} from "@/app/_domains/_inventory/_services/inventoryService";
import {
  SettlementExpense,
  SettlementExpenseCategory,
  SettlementExpenseOccurrence,
  SettlementCostBasisType,
  SettlementHistoricalPurchase,
  SettlementSoldItem,
  SettlementStore,
  SettlementSummary,
  InventoryCostLedgerPage,
  PendingInventoryCostLayer,
} from "../_types/settlement.types";

const getKoreaRange = (startDate: string, endDate: string) => ({
  start: new Date(`${startDate}T00:00:00+09:00`).toISOString(),
  end: new Date(
    new Date(`${endDate}T00:00:00+09:00`).getTime() + 86_400_000,
  ).toISOString(),
});

const PAGE_SIZE = 1000;
const LIVE_SALES_START_DATE = "2026-06-01";
const HISTORICAL_SALES_END_DATE = "2026-05-31";
const LIVE_PURCHASE_START_DATE = "2026-07-22";
const HISTORICAL_PURCHASE_END_DATE = "2026-07-21";
const PURCHASE_NOTE_MARKER = /^\[\[tax_invoice:(.*?)\]\]\r?\n?/;
const PURCHASE_INVOICE_LABELS: Record<string, string> = {
  tax_invoice: "세금계산서",
  cash_receipt: "현금영수증",
  x: "X",
};
const HISTORICAL_EXPENSE_LABELS: Record<string, string> = {
  demo: "시연용",
  service: "서비스",
  coupon_redemption: "쿠폰 사용",
  operating_expense: "관리비",
  historical_exchange_unspecified: "교환 손실 (26년 1월~5월)",
  delivery_expense: "고객 배달비용",
};

const fetchPaged = async <T>(
  getPage: (
    from: number,
    to: number,
  ) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await getPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
};

type PurchaseSourceLine = {
  inbound_type?: string | null;
  handling_type?: string | null;
};
type PurchaseReceiptLineSummary = {
  id: string;
  item_name: string;
  quantity: number | null;
  inventory_purchase_order_lines:
    PurchaseSourceLine | PurchaseSourceLine[] | null;
};
type PurchaseReceiptForAllocation = {
  id: string;
  reversed_at: string | null;
  inventory_purchase_receipt_lines: PurchaseReceiptLineSummary[] | null;
};
type PurchaseOrderSummary = {
  note: string | null;
  entered_total_amount?: number | null;
  inventory_suppliers:
    { name: string | null } | { name: string | null }[] | null;
  inventory_purchase_order_adjustments:
    { kind: "discount" | "payment"; amount: number | null }[] | null;
  inventory_purchase_receipts: PurchaseReceiptForAllocation[] | null;
};
type PurchaseReceiptSummary = PurchaseReceiptForAllocation & {
  arrived_on: string;
  created_at: string;
  inventory_purchase_orders:
    PurchaseOrderSummary | PurchaseOrderSummary[] | null;
};

type SettlementSaleLog = {
  id: number;
  created_at: string;
  jsonb: unknown;
};

type SettlementCostBasisRow = {
  item_name: string;
  basis_type: SettlementCostBasisType;
  quantity: number;
  unit_cost: number;
  sort_order: number;
};

type CostLot = { quantity: number; unitCost: number };

const consumeCostLots = (lots: CostLot[], quantity: number) => {
  let remaining = quantity;
  let cost = 0;
  while (remaining > 0 && lots.length > 0) {
    const lot = lots[0];
    const consumed = Math.min(remaining, lot.quantity);
    cost += consumed * lot.unitCost;
    lot.quantity -= consumed;
    remaining -= consumed;
    if (lot.quantity === 0) lots.shift();
  }
  return { cost, missingQuantity: remaining };
};

const getOne = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const getPurchaseReceiptGross = (
  lines: PurchaseReceiptLineSummary[] | null | undefined,
  unitPrices: Record<string, number | null>,
) =>
  (lines ?? []).reduce((total, line) => {
    const sourceLine = getOne(line.inventory_purchase_order_lines);
    if (sourceLine?.inbound_type === "as_exchange_in") return total;
    return (
      total + Number(line.quantity ?? 0) * Number(unitPrices[line.id] ?? 0)
    );
  }, 0);

export const getSettlementSummary = async (
  startDate: string,
  endDate: string,
): Promise<SettlementSummary> => {
  const liveSalesStart =
    startDate > LIVE_SALES_START_DATE ? startDate : LIVE_SALES_START_DATE;
  const historicalSalesEnd =
    endDate < HISTORICAL_SALES_END_DATE ? endDate : HISTORICAL_SALES_END_DATE;
  const liveSalesRange = getKoreaRange(liveSalesStart, endDate);
  const costReplayRange = getKoreaRange(LIVE_SALES_START_DATE, endDate);
  const livePurchaseStart =
    startDate > LIVE_PURCHASE_START_DATE ? startDate : LIVE_PURCHASE_START_DATE;
  const historicalPurchaseEnd =
    endDate < HISTORICAL_PURCHASE_END_DATE
      ? endDate
      : HISTORICAL_PURCHASE_END_DATE;
  const [
    logs,
    historicalSales,
    receipts,
    historicalPurchases,
    receiptUnitPrices,
    costBases,
    inventoryOverview,
    costLedgerSales,
  ] = await Promise.all([
    LIVE_SALES_START_DATE <= endDate
      ? fetchPaged<SettlementSaleLog>(async (from, to) => {
          const { data, error } = await supabase
            .from("logs")
            .select("id, created_at, jsonb")
            .eq("category", "stamp")
            .gte("created_at", costReplayRange.start)
            .lt("created_at", costReplayRange.end)
            .order("created_at")
            .order("id")
            .range(from, to);
          return { data: data as SettlementSaleLog[] | null, error };
        })
      : Promise.resolve([] as SettlementSaleLog[]),
    startDate <= historicalSalesEnd
      ? fetchPaged<{
          store: "ovape" | "eguvape";
          payment_type: string | null;
          sales_amount: number | null;
          purchase_cost: number | null;
        }>(async (from, to) => {
          const { data, error } = await supabase
            .from("settlement_historical_transactions")
            .select("store, payment_type, sales_amount, purchase_cost")
            .eq("classification", "payment_sale")
            .gte("business_date", startDate)
            .lte("business_date", historicalSalesEnd)
            .order("business_date")
            .order("id")
            .range(from, to);
          return {
            data: data as
              | {
                  store: "ovape" | "eguvape";
                  payment_type: string | null;
                  sales_amount: number | null;
                  purchase_cost: number | null;
                }[]
              | null,
            error,
          };
        })
      : Promise.resolve(
          [] as {
            store: "ovape" | "eguvape";
            payment_type: string | null;
            sales_amount: number | null;
            purchase_cost: number | null;
          }[],
        ),
    LIVE_PURCHASE_START_DATE <= endDate
      ? fetchPaged<PurchaseReceiptSummary>(async (from, to) => {
          const { data, error } = await supabase
            .from("inventory_purchase_receipts")
            .select(
              `id, arrived_on, created_at, reversed_at,
              inventory_purchase_orders(
                note,
                inventory_suppliers(name),
                inventory_purchase_order_adjustments(kind, amount),
                inventory_purchase_receipts(
                  id, reversed_at,
                  inventory_purchase_receipt_lines(
                    id, item_name, quantity,
                    inventory_purchase_order_lines(inbound_type, handling_type)
                  )
                )
              ),
              inventory_purchase_receipt_lines(
                id, item_name, quantity,
                inventory_purchase_order_lines(inbound_type, handling_type)
              )`,
            )
            .gte("arrived_on", LIVE_PURCHASE_START_DATE)
            .lte("arrived_on", endDate)
            .is("reversed_at", null)
            .order("created_at")
            .order("id")
            .range(from, to);
          return {
            data: data as unknown as PurchaseReceiptSummary[] | null,
            error,
          };
        })
      : Promise.resolve([] as PurchaseReceiptSummary[]),
    startDate <= historicalPurchaseEnd
      ? fetchPaged<{
          store: string;
          invoice_type: string;
          total_amount: number | null;
          inventory_suppliers:
            { name: string | null } | { name: string | null }[] | null;
        }>(async (from, to) => {
          const { data, error } = await supabase
            .from("settlement_historical_purchases")
            .select(
              "store, invoice_type, total_amount, inventory_suppliers(name)",
            )
            .gte("order_date", startDate)
            .lte("order_date", historicalPurchaseEnd)
            .order("order_date")
            .order("id")
            .range(from, to);
          return {
            data: data as
              | {
                  store: string;
                  invoice_type: string;
                  total_amount: number | null;
                  inventory_suppliers:
                    { name: string | null } | { name: string | null }[] | null;
                }[]
              | null,
            error,
          };
        })
      : Promise.resolve(
          [] as {
            store: string;
            invoice_type: string;
            total_amount: number | null;
            inventory_suppliers:
              { name: string | null } | { name: string | null }[] | null;
          }[],
        ),
    LIVE_PURCHASE_START_DATE <= endDate
      ? (async () => {
          const { data, error } = await supabase.rpc(
            "get_inventory_purchase_receipt_unit_prices",
            {
              p_start_date: LIVE_PURCHASE_START_DATE,
              p_end_date: endDate,
            },
          );
          if (error) throw error;
          return (data ?? {}) as Record<string, number | null>;
        })()
      : Promise.resolve({} as Record<string, number | null>),
    supabase
      .from("settlement_item_cost_bases")
      .select("item_name, basis_type, quantity, unit_cost, sort_order")
      .order("sort_order")
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as SettlementCostBasisRow[];
      }),
    getInventoryOverview(),
    LIVE_SALES_START_DATE <= endDate
      ? supabase
          .from("inventory_cost_events")
          .select(
            "id,event_at,item_name,quantity,total_cost,inventory_cost_allocations(quantity,unit_cost)",
          )
          .eq("event_type", "sale_out")
          .gte("event_at", liveSalesRange.start)
          .lt("event_at", liveSalesRange.end)
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []) as unknown as Array<{
              id: string;
              event_at: string;
              item_name: string;
              quantity: number;
              total_cost: number | null;
              inventory_cost_allocations: Array<{
                quantity: number;
                unit_cost: number | null;
              }> | null;
            }>;
          })
      : Promise.resolve([]),
  ]);

  const sales = aggregatePaymentSales({
    logs,
    historicalSales,
    liveRange: liveSalesRange,
  });

  const purchases: Record<string, number> = {};
  const addPurchase = (label: string, amount: number) => {
    purchases[label] = (purchases[label] ?? 0) + amount;
  };
  for (const receipt of receipts) {
    if (receipt.arrived_on < livePurchaseStart) continue;
    const order = getOne(receipt.inventory_purchase_orders);
    const receiptGross = getPurchaseReceiptGross(
      receipt.inventory_purchase_receipt_lines,
      receiptUnitPrices,
    );
    if (!order || receiptGross <= 0) continue;

    const activeOrderReceipts = (order.inventory_purchase_receipts ?? [])
      .filter((item) => !item.reversed_at)
      .map((item) => ({
        id: item.id,
        gross: getPurchaseReceiptGross(
          item.inventory_purchase_receipt_lines,
          receiptUnitPrices,
        ),
      }))
      .filter((item) => item.gross > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
    const totalOrderGross = activeOrderReceipts.reduce(
      (total, item) => total + item.gross,
      0,
    );
    const netAdjustment = (
      order.inventory_purchase_order_adjustments ?? []
    ).reduce(
      (total, adjustment) =>
        total +
        (adjustment.kind === "discount" ? -1 : 1) *
          Number(adjustment.amount ?? 0),
      0,
    );
    const receiptIndex = activeOrderReceipts.findIndex(
      (item) => item.id === receipt.id,
    );
    const previousGross = activeOrderReceipts
      .slice(0, Math.max(0, receiptIndex))
      .reduce((total, item) => total + item.gross, 0);
    const adjustmentShare =
      totalOrderGross > 0 && receiptIndex >= 0
        ? Math.round(
            (netAdjustment * (previousGross + receiptGross)) / totalOrderGross,
          ) - Math.round((netAdjustment * previousGross) / totalOrderGross)
        : 0;
    const calculatedOrderAmount = totalOrderGross + netAdjustment;
    const orderAmount = order.entered_total_amount ?? calculatedOrderAmount;
    const amount =
      totalOrderGross > 0
        ? Math.round(
            (orderAmount * (previousGross + receiptGross)) / totalOrderGross,
          ) - Math.round((orderAmount * previousGross) / totalOrderGross)
        : receiptGross + adjustmentShare;
    const marker =
      String(order.note ?? "")
        .match(PURCHASE_NOTE_MARKER)?.[1]
        ?.trim() ?? "";
    const supplierName = getOne(order.inventory_suppliers)?.name?.trim();
    addPurchase(
      marker && marker !== "X"
        ? marker
        : `${supplierName || "매입처 미지정"} · ${marker || "발행 종류 미지정"}`,
      amount,
    );
  }
  for (const purchase of historicalPurchases) {
    const amount = Number(purchase.total_amount ?? 0);
    const storeLabel =
      purchase.store === "ovape"
        ? "오베이프"
        : purchase.store === "eguvape"
          ? "이구베이프"
          : "";
    const supplierName = getOne(purchase.inventory_suppliers)?.name?.trim();
    const invoiceLabel =
      PURCHASE_INVOICE_LABELS[purchase.invoice_type] ?? purchase.invoice_type;
    addPurchase(
      storeLabel && purchase.invoice_type !== "x"
        ? `${storeLabel} ${invoiceLabel}`
        : `${supplierName || storeLabel || "매입처 미지정"} · ${invoiceLabel}`,
      amount,
    );
  }

  const historicalTransactionCost = historicalSales.reduce(
    (total, row) => total + Number(row.purchase_cost ?? 0),
    0,
  );
  const inventoryItemsById = new Map(
    inventoryOverview.items
      .filter((item) => item.item_id != null)
      .map((item) => [Number(item.item_id), item]),
  );
  const inventoryItemsByName = new Map(
    inventoryOverview.items.map((item) => [
      normalizeInventoryItemName(item.item_name),
      item,
    ]),
  );
  const untrackedNames = new Set(
    inventoryOverview.items
      .filter((item) => !item.is_tracked)
      .map((item) => normalizeInventoryItemName(item.item_name)),
  );
  const historicalLots = new Map<string, CostLot[]>();
  const liveLots = new Map<string, CostLot[]>();
  for (const basis of costBases) {
    const name = normalizeInventoryItemName(basis.item_name);
    if (untrackedNames.has(name)) continue;
    const target =
      basis.basis_type === "historical" ? historicalLots : liveLots;
    const lots = target.get(name) ?? [];
    lots.push({
      quantity: Number(basis.quantity),
      unitCost: Number(basis.unit_cost),
    });
    target.set(name, lots);
  }

  const normalizeSoldItem = (item: Record<string, unknown>) => {
    const parsedId = Number(item.itemId);
    const sourceId = Number.isFinite(parsedId) ? parsedId : null;
    const sourceName = normalizeInventoryItemName(String(item.itemName ?? ""));
    const currentItem =
      sourceId == null ? undefined : inventoryItemsById.get(sourceId);
    const exactItem = inventoryItemsByName.get(sourceName);
    const name = currentItem
      ? normalizeInventoryItemName(currentItem.item_name)
      : exactItem
        ? normalizeInventoryItemName(exactItem.item_name)
        : sourceName;
    const quantity = Number(item.quantity ?? 0);
    const action = String(item.inventoryAction ?? "").trim();
    const remark = String(item.remark ?? "")
      .normalize("NFC")
      .trim();
    const isNonSaleRemark =
      /^(?:서비스|시연용|교환입고|교환출고|A\/S 교환출고|재고조정-(?:입고|출고))(?:$|[,\s(])/.test(
        remark,
      );
    if (
      !name ||
      untrackedNames.has(name) ||
      (currentItem && !currentItem.is_tracked) ||
      (exactItem && !exactItem.is_tracked) ||
      (action !== "" && action !== "out") ||
      isNonSaleRemark ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    )
      return null;
    return { name, quantity };
  };

  type CostEvent =
    | { type: "receipt"; at: string; id: string; name: string; lot: CostLot }
    | {
        type: "sale";
        at: string;
        id: string;
        name: string;
        quantity: number;
        included: boolean;
      };
  const events: CostEvent[] = [];
  for (const receipt of receipts) {
    const at = new Date(`${receipt.arrived_on}T00:00:00+09:00`).toISOString();
    for (const line of receipt.inventory_purchase_receipt_lines ?? []) {
      const sourceLine = getOne(line.inventory_purchase_order_lines);
      if (
        sourceLine?.inbound_type === "as_exchange_in" ||
        sourceLine?.handling_type === "demo"
      )
        continue;
      const name = normalizeInventoryItemName(line.item_name);
      const quantity = Number(line.quantity ?? 0);
      const unitCost = receiptUnitPrices[line.id];
      if (
        !name ||
        untrackedNames.has(name) ||
        quantity <= 0 ||
        unitCost == null ||
        unitCost < 0
      )
        continue;
      events.push({
        type: "receipt",
        at,
        id: `${receipt.created_at}:${receipt.id}:${line.id}`,
        name,
        lot: { quantity, unitCost: Number(unitCost) },
      });
    }
  }

  let liveSoldItemCost = 0;
  let soldItemCostMissingQuantity = 0;
  const soldItemCostMissingItems = new Map<
    string,
    {
      itemName: string;
      basisType: SettlementCostBasisType;
      missingQuantity: number;
    }
  >();
  const addMissingCost = (
    itemName: string,
    basisType: SettlementCostBasisType,
    quantity: number,
  ) => {
    if (quantity <= 0) return;
    const key = `${itemName}:${basisType}`;
    const current = soldItemCostMissingItems.get(key);
    soldItemCostMissingItems.set(key, {
      itemName,
      basisType,
      missingQuantity: (current?.missingQuantity ?? 0) + quantity,
    });
  };
  const historicalCutoff = new Date(
    `${LIVE_PURCHASE_START_DATE}T00:00:00+09:00`,
  ).toISOString();
  for (const log of logs) {
    const jsonb = (log.jsonb ?? {}) as Record<string, unknown>;
    if (jsonb.afterServiceOperation === "cost") continue;
    const items = Array.isArray(jsonb.items)
      ? (jsonb.items as Array<Record<string, unknown>>)
      : [];
    for (let index = 0; index < items.length; index += 1) {
      const soldItem = normalizeSoldItem(items[index]);
      if (!soldItem) continue;
      const included =
        log.created_at >= liveSalesRange.start &&
        log.created_at < liveSalesRange.end;
      if (log.created_at < historicalCutoff) {
        const consumed = consumeCostLots(
          historicalLots.get(soldItem.name) ?? [],
          soldItem.quantity,
        );
        if (included) {
          liveSoldItemCost += consumed.cost;
          soldItemCostMissingQuantity += consumed.missingQuantity;
          addMissingCost(soldItem.name, "historical", consumed.missingQuantity);
        }
      } else {
        events.push({
          type: "sale",
          at: log.created_at,
          id: `${log.id}:${index}`,
          name: soldItem.name,
          quantity: soldItem.quantity,
          included,
        });
      }
    }
  }
  events.sort(
    (left, right) =>
      left.at.localeCompare(right.at) ||
      (left.type === right.type
        ? left.id.localeCompare(right.id)
        : left.type === "receipt"
          ? -1
          : 1),
  );
  for (const event of events) {
    if (event.type === "receipt") {
      const lots = liveLots.get(event.name) ?? [];
      lots.push({ ...event.lot });
      liveLots.set(event.name, lots);
      continue;
    }
    const consumed = consumeCostLots(
      liveLots.get(event.name) ?? [],
      event.quantity,
    );
    if (event.included) {
      liveSoldItemCost += consumed.cost;
      soldItemCostMissingQuantity += consumed.missingQuantity;
      addMissingCost(event.name, "opening_20260722", consumed.missingQuantity);
    }
  }
  // 공통 원장이 생성된 6/1 이후 판매원가는 원장을 단일 기준으로 사용합니다.
  // 기존 재생 계산은 누락 원인 비교용으로 유지하되 보고 금액에는 섞지 않습니다.
  void liveSoldItemCost;
  soldItemCostMissingQuantity = 0;
  soldItemCostMissingItems.clear();
  let ledgerSoldItemCost = 0;
  for (const event of costLedgerSales) {
    if (event.total_cost != null)
      ledgerSoldItemCost += Number(event.total_cost);
    const pendingQuantity = (event.inventory_cost_allocations ?? []).reduce(
      (total, allocation) =>
        total +
        (allocation.unit_cost == null ? Number(allocation.quantity) : 0),
      0,
    );
    const missingQuantity =
      pendingQuantity ||
      (event.total_cost == null ? Number(event.quantity) : 0);
    soldItemCostMissingQuantity += missingQuantity;
    addMissingCost(
      event.item_name,
      event.event_at <
        new Date(`${LIVE_PURCHASE_START_DATE}T00:00:00+09:00`).toISOString()
        ? "historical"
        : "opening_20260722",
      missingQuantity,
    );
  }
  const soldItemCost = soldItemCostMissingQuantity
    ? null
    : historicalTransactionCost + ledgerSoldItemCost;

  return {
    sales,
    purchases,
    soldItemCost,
    soldItemCostMissingQuantity,
    soldItemCostMissingItems: [...soldItemCostMissingItems.values()].sort(
      (left, right) => left.itemName.localeCompare(right.itemName, "ko-KR"),
    ),
  };
};

export const getSettlementExpenses = async (
  startDate: string,
  endDate: string,
) => {
  const { data, error } = await supabase
    .from("settlement_expenses")
    .select(
      "id, expense_date, category, category_id, amount, store, is_recurring, recurrence_day, recurrence_end_date, recurrence_cancelled_on, note, created_at",
    )
    .lte("expense_date", endDate)
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as SettlementExpense[]).filter((expense) => {
    if (!expense.is_recurring) return expense.expense_date >= startDate;
    const effectiveEnd = [
      expense.recurrence_end_date,
      expense.recurrence_cancelled_on,
    ]
      .filter(Boolean)
      .sort()[0];
    return !effectiveEnd || effectiveEnd >= startDate;
  });
};

export const getSettlementExpenseTotal = async (
  startDate: string,
  endDate: string,
) => {
  const occurrences = await getSettlementExpenseOccurrences(startDate, endDate);
  return occurrences.reduce((total, expense) => total + expense.amount, 0);
};

export const getSettlementExpenseOccurrences = async (
  startDate: string,
  endDate: string,
): Promise<SettlementExpenseOccurrence[]> => {
  const historicalEnd =
    endDate < HISTORICAL_SALES_END_DATE ? endDate : HISTORICAL_SALES_END_DATE;
  const [expenses, historicalExpenses] = await Promise.all([
    getSettlementExpenses(startDate, endDate),
    startDate <= historicalEnd
      ? fetchPaged<{
          id: string;
          business_date: string;
          store: "ovape" | "eguvape";
          raw_type: string;
          memo: string | null;
          purchase_cost: number | null;
          classification: string;
          created_at: string;
        }>(async (from, to) => {
          const { data, error } = await supabase
            .from("settlement_historical_transactions")
            .select(
              "id, business_date, store, raw_type, memo, purchase_cost, classification, created_at",
            )
            .neq("classification", "payment_sale")
            .gte("business_date", startDate)
            .lte("business_date", historicalEnd)
            .order("business_date", { ascending: false })
            .order("id")
            .range(from, to);
          return {
            data: data as
              | {
                  id: string;
                  business_date: string;
                  store: "ovape" | "eguvape";
                  raw_type: string;
                  memo: string | null;
                  purchase_cost: number | null;
                  classification: string;
                  created_at: string;
                }[]
              | null,
            error,
          };
        })
      : Promise.resolve([]),
  ]);
  const occurrences: SettlementExpenseOccurrence[] = [];
  for (const expense of expenses) {
    if (!expense.is_recurring) {
      if (expense.expense_date >= startDate && expense.expense_date <= endDate)
        occurrences.push({ ...expense, occurrence_date: expense.expense_date });
      continue;
    }
    const day =
      expense.recurrence_day ?? Number(expense.expense_date.slice(8, 10));
    const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
    const lastMonth = endDate.slice(0, 7);
    while (
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}` <=
      lastMonth
    ) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      const occurrence = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
      const recurrenceEnd = expense.recurrence_end_date;
      const cancelledOn = expense.recurrence_cancelled_on;
      if (
        occurrence >= expense.expense_date &&
        occurrence >= startDate &&
        occurrence <= endDate &&
        (!recurrenceEnd || occurrence <= recurrenceEnd) &&
        (!cancelledOn || occurrence < cancelledOn)
      )
        occurrences.push({ ...expense, occurrence_date: occurrence });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  for (const expense of historicalExpenses) {
    occurrences.push({
      id: `historical-${expense.id}`,
      expense_date: expense.business_date,
      occurrence_date: expense.business_date,
      category:
        HISTORICAL_EXPENSE_LABELS[expense.classification] ?? expense.raw_type,
      category_id: null,
      amount: Number(expense.purchase_cost ?? 0),
      store: expense.store,
      is_recurring: false,
      recurrence_day: null,
      recurrence_end_date: null,
      recurrence_cancelled_on: null,
      note: expense.memo,
      created_at: expense.created_at,
    });
  }
  return occurrences.sort(
    (left, right) =>
      right.occurrence_date.localeCompare(left.occurrence_date) ||
      right.created_at.localeCompare(left.created_at),
  );
};

export const getSettlementExpenseCategories = async () => {
  const { data, error } = await supabase
    .from("settlement_expense_categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as SettlementExpenseCategory[];
};

export const createSettlementExpenseCategory = async (name: string) => {
  const { error } = await supabase
    .from("settlement_expense_categories")
    .insert({ name: name.trim() });
  if (error) throw error;
};

export const renameSettlementExpenseCategory = async (values: {
  id: string;
  name: string;
}) => {
  const { error } = await supabase.rpc("rename_settlement_expense_category", {
    p_category_id: values.id,
    p_name: values.name.trim(),
  });
  if (error) throw error;
};

export const createSettlementExpense = async (values: {
  expenseDate: string;
  categoryId: string;
  category: string;
  amount: number;
  store: SettlementStore;
  isRecurring: boolean;
  recurrenceDay: number | null;
  recurrenceEndDate: string;
  note: string;
}) => {
  const { error } = await supabase.from("settlement_expenses").insert({
    expense_date: values.expenseDate,
    category_id: values.categoryId,
    category: values.category.trim(),
    amount: values.amount,
    store: values.store,
    is_recurring: values.isRecurring,
    recurrence_day: values.isRecurring ? values.recurrenceDay : null,
    recurrence_end_date: values.isRecurring
      ? values.recurrenceEndDate || null
      : null,
    note: values.note.trim() || null,
  });
  if (error) throw error;
};

export const updateSettlementExpense = async (
  id: string,
  values: {
    expenseDate: string;
    categoryId: string;
    category: string;
    amount: number;
    store: SettlementStore;
    isRecurring: boolean;
    recurrenceDay: number | null;
    recurrenceEndDate: string;
    note: string;
  },
) => {
  const { error } = await supabase
    .from("settlement_expenses")
    .update({
      expense_date: values.expenseDate,
      category_id: values.categoryId,
      category: values.category.trim(),
      amount: values.amount,
      store: values.store,
      is_recurring: values.isRecurring,
      recurrence_day: values.isRecurring ? values.recurrenceDay : null,
      recurrence_end_date: values.isRecurring
        ? values.recurrenceEndDate || null
        : null,
      recurrence_cancelled_on: null,
      note: values.note.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
};

export const cancelSettlementExpenseRecurrence = async (
  id: string,
  cancelledOn: string,
) => {
  const { error } = await supabase
    .from("settlement_expenses")
    .update({
      recurrence_cancelled_on: cancelledOn,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
};

export const deleteSettlementExpense = async (id: string) => {
  const { error } = await supabase
    .from("settlement_expenses")
    .delete()
    .eq("id", id);
  if (error) throw error;
};

export const getInventoryCostLedger = async (params: {
  startDate?: string;
  endDate?: string;
  itemName?: string;
  eventType?: string;
  costStatus?: "confirmed" | "pending";
  offset?: number;
  limit?: number;
}): Promise<InventoryCostLedgerPage> => {
  const range = params.startDate
    ? getKoreaRange(params.startDate, params.endDate || params.startDate)
    : null;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 100;
  let request = supabase
    .from("inventory_cost_reporting_events")
    .select(
      "id,event_type,event_at,item_name,direction,quantity,total_cost,reference_type,reference_id,settlement_effect,metadata",
      { count: "exact" },
    )
    .order("event_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (range) request = request.gte("event_at", range.start).lt("event_at", range.end);
  if (params.itemName) request = request.ilike("item_name", `%${params.itemName}%`);
  if (params.eventType) request = request.eq("event_type", params.eventType);
  // 이벤트의 총원가는 원가층 확정 여부와 함께 관리된다. 0원도 확정 원가이므로 null 여부로 구분한다.
  if (params.costStatus === "confirmed") request = request.not("total_cost", "is", null);
  if (params.costStatus === "pending") request = request.is("total_cost", null);
  const { data: fetchedEvents, count, error: eventsError } = await request;
  if (eventsError) throw eventsError;
  const events = (fetchedEvents ?? []).filter(
    (event) =>
      !(
        event.event_type === "reconciliation_out" &&
        (event.metadata as Record<string, unknown> | null)?.restoredAt
      ),
  );
  const eventIds = events.map((event) => String(event.id));
  const layers: Array<{
    id: string;
    source_event_id: string;
    item_name: string;
    unit_cost: number | null;
    cost_status: "confirmed" | "pending";
    queue_sequence: number;
  }> = [];
  const allocations: Array<{
    outbound_event_id: string;
    source_layer_id: string;
    quantity: number;
    unit_cost: number | null;
  }> = [];
  if (eventIds.length) {
    const [
      { data: layerRows, error: layersError },
      { data: allocationRows, error: allocationsError },
    ] = await Promise.all([
      supabase
        .from("inventory_cost_layers")
        .select("id,source_event_id,item_name,unit_cost,cost_status,queue_sequence")
        .in("source_event_id", eventIds),
      supabase
        .from("inventory_cost_allocations")
        .select("outbound_event_id,source_layer_id,quantity,unit_cost")
        .in("outbound_event_id", eventIds),
    ]);
    if (layersError) throw layersError;
    if (allocationsError) throw allocationsError;
    layers.push(...(layerRows ?? []));
    allocations.push(...(allocationRows ?? []));

    const sourceLayerIds = [...new Set((allocationRows ?? []).map((row) => String(row.source_layer_id)))];
    if (sourceLayerIds.length) {
      const { data: sourceLayers, error: sourceLayersError } = await supabase
        .from("inventory_cost_layers")
        .select("id,source_event_id,item_name,unit_cost,cost_status,queue_sequence")
        .in("id", sourceLayerIds);
      if (sourceLayersError) throw sourceLayersError;
      layers.push(...(sourceLayers ?? []));
    }
  }

  const layersByEvent = new Map(
    (layers ?? []).map((layer) => [String(layer.source_event_id), layer]),
  );
  const layersById = new Map(
    (layers ?? []).map((layer) => [String(layer.id), layer]),
  );
  const allocationsByEvent = new Map<string, typeof allocations>();
  for (const allocation of allocations ?? []) {
    const key = String(allocation.outbound_event_id);
    const rows = allocationsByEvent.get(key) ?? [];
    rows.push(allocation);
    allocationsByEvent.set(key, rows);
  }

  const rows = events.map((event) => {
    const layer = layersByEvent.get(String(event.id));
    const eventAllocations = allocationsByEvent.get(String(event.id)) ?? [];
    return {
      id: String(event.id),
      eventAt: String(event.event_at),
      eventType: String(event.event_type),
      itemName: String(event.item_name),
      direction: event.direction as "in" | "out",
      quantity: Number(event.quantity),
      totalCost: event.total_cost == null ? null : Number(event.total_cost),
      settlementEffect: String(event.settlement_effect),
      referenceType: String(event.reference_type),
      referenceId: String(event.reference_id),
      costStatus: layer
        ? (layer.cost_status as "confirmed" | "pending")
        : event.total_cost == null
          ? "pending"
          : "confirmed",
      queueSequence: layer ? Number(layer.queue_sequence) : null,
      sourceSummary: (event.metadata as Record<string, unknown> | null)?.monetaryOnly
        ? "수동 확정·출처 미확인 (재고 차감 없음)"
        : (event.metadata as Record<string, unknown> | null)?.serviceAttributedCost !== undefined
          ? `기존 소진 ${Number((event.metadata as Record<string, unknown>).originalConsumedCost).toLocaleString("ko-KR")}원 중 서비스로 ${Number((event.metadata as Record<string, unknown>).serviceAttributedCost).toLocaleString("ko-KR")}원 귀속`
        : eventAllocations
        .map((allocation) => {
          const source = layersById.get(String(allocation.source_layer_id));
          return `${source?.item_name ?? event.item_name} ${Number(allocation.quantity)}개`;
        })
        .join(", "),
      metadata: (event.metadata ?? {}) as Record<string, unknown>,
    };
  });
  return {
    rows,
    totalCount: count ?? 0,
    nextOffset: offset + (fetchedEvents?.length ?? 0) < (count ?? 0)
      ? offset + (fetchedEvents?.length ?? 0)
      : null,
  };
};

export const getPendingInventoryCostLayers = async (): Promise<
  PendingInventoryCostLayer[]
> => {
  const [pendingLayersResult, pendingAllocationsResult] = await Promise.all([
    supabase
      .from("inventory_cost_layers")
      .select(
        "id,source_event_id,item_name,original_quantity,remaining_quantity",
      )
      .eq("cost_status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("inventory_cost_allocations")
      .select("source_layer_id")
      .is("unit_cost", null),
  ]);
  const { data: pendingLayers, error: layersError } = pendingLayersResult;
  if (layersError) throw layersError;
  if (pendingAllocationsResult.error) throw pendingAllocationsResult.error;
  const unresolvedSourceIds = [
    ...new Set(
      (pendingAllocationsResult.data ?? []).map((row) =>
        String(row.source_layer_id),
      ),
    ),
  ];
  let allocatedSourceLayers: typeof pendingLayers = [];
  for (let index = 0; index < unresolvedSourceIds.length; index += 500) {
    const { data, error } = await supabase
      .from("inventory_cost_layers")
      .select(
        "id,source_event_id,item_name,original_quantity,remaining_quantity",
      )
      .in("id", unresolvedSourceIds.slice(index, index + 500));
    if (error) throw error;
    allocatedSourceLayers = [...allocatedSourceLayers, ...(data ?? [])];
  }
  const layers = [
    ...new Map(
      [...(pendingLayers ?? []), ...allocatedSourceLayers].map((layer) => [
        String(layer.id),
        layer,
      ]),
    ).values(),
  ];
  if (!layers?.length) return [];

  const eventIds = [
    ...new Set(layers.map((layer) => String(layer.source_event_id))),
  ];
  const events: Array<{
    id: string;
    event_at: string;
    event_type: string;
    reference_type: string;
    reference_id: string;
  }> = [];
  for (let index = 0; index < eventIds.length; index += 500) {
    const { data, error } = await supabase
      .from("inventory_cost_events")
      .select("id,event_at,event_type,reference_type,reference_id")
      .in("id", eventIds.slice(index, index + 500));
    if (error) throw error;
    events.push(...((data ?? []) as typeof events));
  }
  const eventsById = new Map(events.map((event) => [String(event.id), event]));
  return layers.flatMap((layer) => {
    const event = eventsById.get(String(layer.source_event_id));
    if (!event) return [];
    return [
      {
        id: String(layer.id),
        itemName: String(layer.item_name),
        quantity: Number(layer.original_quantity),
        remainingQuantity: Number(layer.remaining_quantity),
        eventAt: String(event.event_at),
        eventType: String(event.event_type),
        referenceType: String(event.reference_type),
        referenceId: String(event.reference_id),
      },
    ];
  });
};

export const getSettlementCostItems = async (): Promise<
  SettlementSoldItem[]
> => {
  const start = new Date("2026-06-01T00:00:00+09:00").toISOString();
  const inventoryOverview = await getInventoryOverview();
  const trackedNames = new Set(
    inventoryOverview.items
      .filter((item) => item.is_tracked)
      .map((item) => normalizeInventoryItemName(item.item_name)),
  );
  const untrackedNames = new Set(
    inventoryOverview.items
      .filter((item) => !item.is_tracked)
      .map((item) => normalizeInventoryItemName(item.item_name)),
  );
  const inventoryItemsById = new Map(
    inventoryOverview.items
      .filter((item) => item.item_id != null)
      .map((item) => [Number(item.item_id), item]),
  );
  const trackedItemsByName = new Map(
    inventoryOverview.items
      .filter((item) => item.is_tracked)
      .map((item) => [normalizeInventoryItemName(item.item_name), item]),
  );
  const currentItemStatus = new Map<string, "active" | "inactive">();
  for (const item of inventoryOverview.items) {
    const name = normalizeInventoryItemName(item.item_name);
    const previous = currentItemStatus.get(name);
    if (item.is_use || !previous)
      currentItemStatus.set(name, item.is_use ? "active" : "inactive");
  }
  const logs: { created_at: string; jsonb: unknown }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("logs")
      .select("created_at, jsonb")
      .eq("category", "stamp")
      .gte("created_at", start)
      .order("created_at")
      .range(from, from + 999);
    if (error) throw error;
    logs.push(...((data ?? []) as { created_at: string; jsonb: unknown }[]));
    if ((data ?? []).length < 1000) break;
  }
  const quantities = new Map<
    string,
    { itemId: number | null; before: number; after: number; opening: number }
  >();
  for (const log of logs) {
    const isBefore = log.created_at < "2026-07-21T15:00:00+00:00";
    const jsonb = (log.jsonb ?? {}) as Record<string, unknown>;
    if (jsonb.afterServiceOperation === "cost") continue;
    const items = Array.isArray(jsonb.items)
      ? (jsonb.items as Array<Record<string, unknown>>)
      : [];
    for (const item of items) {
      const parsedId = Number(item.itemId);
      const sourceId = Number.isFinite(parsedId) ? parsedId : null;
      const sourceName = normalizeInventoryItemName(
        String(item.itemName ?? ""),
      );
      const currentItem =
        sourceId == null ? undefined : inventoryItemsById.get(sourceId);
      if (currentItem && !currentItem.is_tracked) continue;
      const exactTrackedItem = trackedItemsByName.get(sourceName);
      const name = currentItem
        ? normalizeInventoryItemName(currentItem.item_name)
        : sourceName;
      const id = currentItem?.item_id ?? exactTrackedItem?.item_id ?? null;
      const quantity = Number(item.quantity ?? 0);
      const action = String(item.inventoryAction ?? "").trim();
      const remark = String(item.remark ?? "")
        .normalize("NFC")
        .trim();
      const isNormalOutbound = action === "" || action === "out";
      const isNonSaleRemark =
        /^(?:서비스|시연용|교환입고|교환출고|A\/S 교환출고|재고조정-(?:입고|출고))(?:$|[,\s(])/.test(
          remark,
        );
      if (
        !name ||
        untrackedNames.has(name) ||
        (!trackedNames.has(name) && sourceId == null) ||
        !isNormalOutbound ||
        isNonSaleRemark ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      )
        continue;
      const current = quantities.get(name) ?? {
        itemId: id,
        before: 0,
        after: 0,
        opening: 0,
      };
      if (id !== null) current.itemId = id;
      if (isBefore) current.before += quantity;
      else current.after += quantity;
      quantities.set(name, current);
    }
  }
  let initialMovementsQuery = supabase
    .from("inventory_movements")
    .select("item_name, quantity_delta")
    .eq("movement_type", "initial");
  if (inventoryOverview.initializedAt)
    initialMovementsQuery = initialMovementsQuery.lte(
      "created_at",
      inventoryOverview.initializedAt,
    );
  const { data: initialMovements, error: initialMovementsError } =
    await initialMovementsQuery;
  if (initialMovementsError) throw initialMovementsError;
  for (const movement of initialMovements ?? []) {
    const name = movement.item_name.trim();
    const quantity = Number(movement.quantity_delta);
    if (
      !name ||
      untrackedNames.has(normalizeInventoryItemName(name)) ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    )
      continue;
    const current = quantities.get(name) ?? {
      itemId: null,
      before: 0,
      after: 0,
      opening: 0,
    };
    current.opening += quantity;
    quantities.set(name, current);
  }
  const { data: namedCosts, error: namedCostsError } = await supabase
    .from("settlement_item_cost_bases")
    .select("item_name, basis_type, quantity, unit_cost, sort_order")
    .order("sort_order");
  if (namedCostsError) throw namedCostsError;
  const costMap = new Map<
    string,
    { quantity: number; unitCost: number; sortOrder: number }[]
  >();
  for (const cost of namedCosts ?? []) {
    const key = `${cost.item_name}:${cost.basis_type}`;
    const segments = costMap.get(key) ?? [];
    segments.push({
      quantity: Number(cost.quantity),
      unitCost: Number(cost.unit_cost),
      sortOrder: Number(cost.sort_order),
    });
    costMap.set(key, segments);
  }
  return [...quantities.entries()]
    .map(([itemName, value]) => ({
      itemId: value.itemId,
      itemName,
      soldBeforeBaseline: value.before,
      soldAfterBaseline: value.after,
      openingQuantity: value.opening,
      currentItemStatus:
        currentItemStatus.get(itemName) ?? ("missing" as const),
      historicalSegments: costMap.get(`${itemName}:historical`) ?? [],
      openingSegments: costMap.get(`${itemName}:opening_20260722`) ?? [],
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName, "ko"));
};

export const saveSettlementItemCost = async (item: {
  itemId: number | null;
  itemName: string;
  basisType: SettlementCostBasisType;
  segments: { quantity: number; unitCost: number }[];
}) => {
  const { error } = await supabase.rpc("save_settlement_item_cost_segments", {
    p_item_id: item.itemId,
    p_item_name: item.itemName,
    p_basis_type: item.basisType,
    p_segments: item.segments.map((segment) => ({
      quantity: segment.quantity,
      unit_cost: segment.unitCost,
    })),
  });
  if (error) throw error;
  const finalSegment = item.segments.at(-1);
  if (finalSegment) {
    const { error: resolveError } = await supabase.rpc(
      "resolve_inventory_cost_pending_layers",
      {
        p_item_name: item.itemName,
        p_basis_type: item.basisType,
        p_unit_cost: finalSegment.unitCost,
      },
    );
    if (resolveError) throw resolveError;
  }
};

export const saveSettlementHistoricalItemCostsBulk = async (
  items: {
    itemId: number | null;
    itemName: string;
    segments: { quantity: number; unitCost: number }[];
  }[],
) => {
  const { error } = await supabase.rpc("save_settlement_item_costs_bulk", {
    p_items: items.map((item) => ({
      item_id: item.itemId,
      item_name: item.itemName,
      segments: item.segments.map((segment) => ({
        quantity: segment.quantity,
        unit_cost: segment.unitCost,
      })),
    })),
  });
  if (error) throw error;
};

export const saveSettlementUnifiedItemCostsBulk = async (
  items: {
    itemId: number | null;
    itemName: string;
    soldQuantity: number;
    openingQuantity: number;
    segments: { quantity: number; unitCost: number }[];
  }[],
) => {
  const { error } = await supabase.rpc(
    "save_settlement_unified_item_costs_bulk",
    {
      p_items: items.map((item) => ({
        item_id: item.itemId,
        item_name: item.itemName,
        sold_quantity: item.soldQuantity,
        opening_quantity: item.openingQuantity,
        segments: item.segments.map((segment) => ({
          quantity: segment.quantity,
          unit_cost: segment.unitCost,
        })),
      })),
    },
  );
  if (error) throw error;
};

export const getHistoricalPurchaseSuppliers = async () => {
  const { data, error } = await supabase
    .from("inventory_suppliers")
    .select("id, name")
    .eq("is_use", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
};

export const getSettlementHistoricalPurchases = async () => {
  const { data, error } = await supabase
    .from("settlement_historical_purchases")
    .select(
      "id, order_date, store, invoice_type, supplier_id, total_amount, purchase_amount, supplier_discount, wholesale_shipping_fee, points_used, paid_amount, note, inventory_suppliers(name)",
    )
    .order("order_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SettlementHistoricalPurchase[];
};

export const saveSettlementHistoricalPurchase = async (values: {
  id?: string;
  orderDate: string;
  store: "ovape" | "eguvape" | "other";
  invoiceType: "tax_invoice" | "cash_receipt" | "x";
  supplierId: string;
  totalAmount: number;
  purchaseAmount: number;
  supplierDiscount: number;
  wholesaleShippingFee: number;
  pointsUsed: number;
  paidAmount: number;
  note: string;
}) => {
  const payload = {
    order_date: values.orderDate,
    store: values.store,
    invoice_type: values.invoiceType,
    supplier_id: values.supplierId,
    total_amount: values.totalAmount,
    purchase_amount: values.purchaseAmount,
    supplier_discount: values.supplierDiscount,
    wholesale_shipping_fee: values.wholesaleShippingFee,
    points_used: values.pointsUsed,
    paid_amount: values.paidAmount,
    note: values.note.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const query = values.id
    ? supabase
        .from("settlement_historical_purchases")
        .update(payload)
        .eq("id", values.id)
    : supabase.from("settlement_historical_purchases").insert(payload);
  const { error } = await query;
  if (error) throw error;
};

export const saveSettlementHistoricalPurchasesBulk = async (
  rows: {
    orderDate: string;
    store: "ovape" | "eguvape" | "other";
    invoiceType: "tax_invoice" | "cash_receipt" | "x";
    supplierId: string;
    totalAmount: number;
    purchaseAmount: number;
    supplierDiscount: number;
    wholesaleShippingFee: number;
    pointsUsed: number;
    paidAmount: number;
    note: string;
  }[],
) => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("settlement_historical_purchases")
    .insert(
      rows.map((row) => ({
        order_date: row.orderDate,
        store: row.store,
        invoice_type: row.invoiceType,
        supplier_id: row.supplierId,
        total_amount: row.totalAmount,
        purchase_amount: row.purchaseAmount,
        supplier_discount: row.supplierDiscount,
        wholesale_shipping_fee: row.wholesaleShippingFee,
        points_used: row.pointsUsed,
        paid_amount: row.paidAmount,
        note: row.note.trim() || null,
        updated_at: now,
      })),
    );
  if (error) throw error;
};

export const deleteSettlementHistoricalPurchase = async (id: string) => {
  const { error } = await supabase
    .from("settlement_historical_purchases")
    .delete()
    .eq("id", id);
  if (error) throw error;
};
