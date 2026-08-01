import supabase from "@/libs/supabaseClient";
import {
  CashClosingType,
  CashCounts,
  DailyCashSales,
  DailyPaymentSales,
  WorkShift,
} from "../_types/cashManagement.types";

const CASH_PAYMENT_TYPES = new Set([
  "cash",
  "cash_receipt",
  "egu_cash",
  "egu_cash_receipt",
]);

const NON_PAYMENT_TYPES = new Set(["remark", "shipment_remark"]);
const OVAPE_PAYMENT_TYPES = [
  { paymentType: "card", label: "카드" },
  { paymentType: "transfer", label: "이체" },
  { paymentType: "cash", label: "현금" },
  { paymentType: "cash_receipt", label: "현금영수증" },
  { paymentType: "transfer_cash_receipt", label: "이체현금영수증" },
  { paymentType: "kakaotalk", label: "카카오톡" },
] as const;
const EGU_PAYMENT_TYPES = [
  { paymentType: "egu_card", label: "카드" },
  { paymentType: "egu_transfer", label: "이체" },
  { paymentType: "egu_cash", label: "현금" },
  { paymentType: "egu_cash_receipt", label: "현금영수증" },
] as const;

const getKoreaDateRange = (date: string) => {
  const startDate = new Date(`${date}T00:00:00+09:00`);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
  return { start: startDate.toISOString(), end: endDate.toISOString() };
};

export const getDailyCashSales = async (
  date: string,
): Promise<DailyCashSales> => {
  const { start, end } = getKoreaDateRange(date);
  const { data, error } = await supabase
    .from("logs")
    .select("jsonb")
    .eq("category", "stamp")
    .gte("created_at", start)
    .lt("created_at", end);

  if (error) throw error;

  let ovape = 0;
  let eguVape = 0;

  for (const log of data ?? []) {
    const jsonb = (log.jsonb ?? {}) as Record<string, unknown>;
    const splitPayments = Array.isArray(jsonb.payments)
      ? (jsonb.payments as Array<{
          paymentType?: unknown;
          amount?: unknown;
        }>)
      : [];
    if (splitPayments.length) {
      for (const payment of splitPayments) {
        const splitType = String(payment.paymentType ?? "");
        const splitAmount = Number(payment.amount ?? 0);
        if (!CASH_PAYMENT_TYPES.has(splitType) || !Number.isFinite(splitAmount))
          continue;
        if (splitType.startsWith("egu_")) eguVape += splitAmount;
        else ovape += splitAmount;
      }
      continue;
    }
    const paymentType = String(jsonb.paymentType ?? "");
    if (!CASH_PAYMENT_TYPES.has(paymentType)) continue;

    const amount = Number(jsonb.totalAmount ?? 0);
    if (!Number.isFinite(amount)) continue;

    if (paymentType.startsWith("egu_")) {
      eguVape += amount;
    } else {
      ovape += amount;
    }
  }

  return { ovape, eguVape, total: ovape + eguVape };
};

export const getDailyPaymentSales = async (
  date: string,
): Promise<DailyPaymentSales> => {
  const usesSeparatedOutboundSummary = date >= "2026-07-31";
  const { start, end } = getKoreaDateRange(date);
  const [logsResult, receiptsResult] = await Promise.all([
    supabase
      .from("logs")
      .select("jsonb")
      .eq("category", "stamp")
      .gte("created_at", start)
      .lt("created_at", end),
    supabase
      .from("inventory_purchase_receipts")
      .select(
        "id, inventory_purchase_orders(inventory_suppliers(name)), inventory_purchase_receipt_lines(quantity)",
      )
      .eq("arrived_on", date)
      .is("reversed_at", null),
  ]);

  if (logsResult.error) throw logsResult.error;
  if (receiptsResult.error) throw receiptsResult.error;
  const data = logsResult.data;

  const amountByPaymentType = new Map<string, number>();
  const quantityByCategory = new Map<string, number>();
  const quantityByOtherOutboundType = new Map<
    string,
    { type: string; label: string; quantity: number }
  >();
  const quantityByInboundType = new Map<
    string,
    {
      type: "purchase" | "adjustment_in" | "exchange_in";
      label: string;
      quantity: number;
    }
  >();
  const deliveryByMethod = new Map<
    "store_visit" | "parcel" | "delivery",
    { orderCount: number; quantity: number; fee: number }
  >();

  for (const log of data ?? []) {
    const jsonb = (log.jsonb ?? {}) as Record<string, unknown>;
    const splitPayments = Array.isArray(jsonb.payments)
      ? (jsonb.payments as Array<{
          paymentType?: unknown;
          amount?: unknown;
        }>)
      : [];
    if (splitPayments.length) {
      for (const payment of splitPayments) {
        const splitType = String(payment.paymentType ?? "").trim();
        const splitAmount = Number(payment.amount ?? 0);
        if (
          !splitType ||
          NON_PAYMENT_TYPES.has(splitType) ||
          !Number.isFinite(splitAmount)
        )
          continue;
        amountByPaymentType.set(
          splitType,
          (amountByPaymentType.get(splitType) ?? 0) + splitAmount,
        );
      }
    }
    const paymentType = String(jsonb.paymentType ?? "").trim();
    const amount = Number(jsonb.totalAmount ?? 0);
    if (!splitPayments.length) {
      if (
        paymentType &&
        !NON_PAYMENT_TYPES.has(paymentType) &&
        Number.isFinite(amount)
      ) {
        amountByPaymentType.set(
          paymentType,
          (amountByPaymentType.get(paymentType) ?? 0) + amount,
        );
      }
    }

    const deliveryMethod =
      jsonb.deliveryMethod === "store_visit" ||
      jsonb.deliveryMethod === "parcel" ||
      jsonb.deliveryMethod === "delivery"
        ? jsonb.deliveryMethod
        : null;
    const items = Array.isArray(jsonb.items)
      ? (jsonb.items as Array<{
          itemCategoryName?: unknown;
          quantity?: unknown;
          adjustedUnitPrice?: unknown;
          inventoryAction?: unknown;
          remark?: unknown;
        }>)
      : [];
    let deliveryItemQuantity = 0;
    let hasOutboundItem = false;
    for (const item of items) {
      const quantity = Number(item.quantity ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      const categoryName = String(item.itemCategoryName ?? "").trim() || "기타";
      const inventoryAction = String(item.inventoryAction ?? "").trim();
      if (
        inventoryAction === "exchange_in" ||
        inventoryAction === "adjustment_in"
      ) {
        const type = inventoryAction;
        const label =
          inventoryAction === "exchange_in" ? "교환입고" : "재고조정-입고";
        const current = quantityByInboundType.get(type);
        quantityByInboundType.set(type, {
          type,
          label,
          quantity: (current?.quantity ?? 0) + quantity,
        });
      }
      if (
        usesSeparatedOutboundSummary &&
        (inventoryAction === "exchange_in" ||
          inventoryAction === "adjustment_in")
      ) {
        continue;
      }
      hasOutboundItem = true;
      const remark = String(item.remark ?? "").trim();
      const outboundType =
        inventoryAction === "exchange_out"
          ? "교환출고"
          : inventoryAction === "adjustment_out"
            ? "재고조정-출고"
            : item.adjustedUnitPrice != null
              ? "가격조정"
              : remark.startsWith("서비스")
                ? "서비스"
                : remark.startsWith("시연용")
                  ? "시연용"
                  : remark.startsWith("재고조정-출고") ||
                      remark.startsWith("출고처리")
                    ? "재고조정-출고"
                    : null;

      if (usesSeparatedOutboundSummary && outboundType) {
        const key = `${categoryName}\u0000${outboundType}`;
        const current = quantityByOtherOutboundType.get(key);
        quantityByOtherOutboundType.set(key, {
          type: outboundType,
          label: `${categoryName} - ${outboundType}`,
          quantity: (current?.quantity ?? 0) + quantity,
        });
      } else {
        quantityByCategory.set(
          categoryName,
          (quantityByCategory.get(categoryName) ?? 0) + quantity,
        );
      }
      deliveryItemQuantity += quantity;
    }

    if (deliveryMethod && (!usesSeparatedOutboundSummary || hasOutboundItem)) {
      const current = deliveryByMethod.get(deliveryMethod) ?? {
        orderCount: 0,
        quantity: 0,
        fee: 0,
      };
      deliveryByMethod.set(deliveryMethod, {
        orderCount: current.orderCount + 1,
        quantity: current.quantity + deliveryItemQuantity,
        fee:
          current.fee +
          (deliveryMethod === "store_visit"
            ? 0
            : Number(jsonb.deliveryFee ?? 0) || 0),
      });
    }
  }

  for (const receipt of receiptsResult.data ?? []) {
    const order = Array.isArray(receipt.inventory_purchase_orders)
      ? receipt.inventory_purchase_orders[0]
      : receipt.inventory_purchase_orders;
    const supplier = Array.isArray(order?.inventory_suppliers)
      ? order.inventory_suppliers[0]
      : order?.inventory_suppliers;
    const supplierName = String(supplier?.name ?? "").trim();
    if (!supplierName) continue;
    const quantity = (receipt.inventory_purchase_receipt_lines ?? []).reduce(
      (sum, line) => sum + Number(line.quantity ?? 0),
      0,
    );
    if (quantity <= 0) continue;
    const key = `purchase:${supplierName}`;
    const current = quantityByInboundType.get(key);
    quantityByInboundType.set(key, {
      type: "purchase",
      label: supplierName,
      quantity: (current?.quantity ?? 0) + 1,
    });
  }

  if (!usesSeparatedOutboundSummary) {
    const parcelCount = deliveryByMethod.get("parcel")?.orderCount ?? 0;
    const deliveryCount = deliveryByMethod.get("delivery")?.orderCount ?? 0;
    if (parcelCount > 0) quantityByCategory.set("택배", parcelCount);
    if (deliveryCount > 0) quantityByCategory.set("배달", deliveryCount);
  }

  const ovapeBreakdown = OVAPE_PAYMENT_TYPES.map((item) => ({
    ...item,
    amount: amountByPaymentType.get(item.paymentType) ?? 0,
  }));
  const eguVapeBreakdown = EGU_PAYMENT_TYPES.map((item) => ({
    ...item,
    amount: amountByPaymentType.get(item.paymentType) ?? 0,
  }));
  const breakdown = [...ovapeBreakdown, ...eguVapeBreakdown];

  return {
    breakdown,
    ovapeBreakdown,
    eguVapeBreakdown,
    itemSummary: [...quantityByCategory.entries()]
      .map(([categoryName, quantity]) => ({ categoryName, quantity }))
      .sort((a, b) => b.quantity - a.quantity),
    outboundTypeSummary: [...quantityByOtherOutboundType.values()].sort(
      (a, b) =>
        b.quantity - a.quantity || a.label.localeCompare(b.label, "ko-KR"),
    ),
    inboundSummary: [...quantityByInboundType.values()].sort(
      (a, b) =>
        b.quantity - a.quantity || a.label.localeCompare(b.label, "ko-KR"),
    ),
    deliverySummary: [
      ["store_visit", "매장방문"],
      ["parcel", "택배"],
      ["delivery", "배달"],
    ].flatMap(([method, label]) => {
      const summary = deliveryByMethod.get(
        method as "store_visit" | "parcel" | "delivery",
      );
      return summary
        ? [
            {
              method: method as "store_visit" | "parcel" | "delivery",
              label,
              ...summary,
            },
          ]
        : [];
    }),
    total: breakdown.reduce((sum, item) => sum + item.amount, 0),
  };
};

export const getCashClosing = async (
  date: string,
): Promise<CashClosingType | null> => {
  const { data, error } = await supabase
    .from("cash_register_closings")
    .select("*")
    .eq("business_date", date)
    .maybeSingle();

  if (error) throw error;
  return data as CashClosingType | null;
};

export const getPreviousClosing = async (
  date: string,
): Promise<CashClosingType | null> => {
  const { data, error } = await supabase
    .from("cash_register_closings")
    .select("*")
    .lt("business_date", date)
    .order("business_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as CashClosingType | null;
};

export const getCashClosingHistory = async (
  startDate: string,
  endDate: string,
): Promise<CashClosingType[]> => {
  const { data, error } = await supabase
    .from("cash_register_closings")
    .select("*")
    .gte("business_date", startDate)
    .lte("business_date", endDate)
    .order("business_date", { ascending: false })
    .limit(366);

  if (error) throw error;
  return (data ?? []) as CashClosingType[];
};

export const saveCashClosing = async (values: {
  businessDate: string;
  openingCash: number;
  cashIn: number;
  cashOut: number;
  ovapeCashSales: number;
  eguCashSales: number;
  expectedCash: number;
  actualCash: number;
  cashCounts: CashCounts;
  workShifts: WorkShift[];
  workerName: string;
  note: string;
}): Promise<void> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) throw new Error("세션을 찾을 수 없습니다.");

  const { error } = await supabase.from("cash_register_closings").upsert(
    {
      business_date: values.businessDate,
      opening_cash: values.openingCash,
      cash_in: values.cashIn,
      cash_out: values.cashOut,
      ovape_cash_sales: values.ovapeCashSales,
      egu_cash_sales: values.eguCashSales,
      expected_cash: values.expectedCash,
      actual_cash: values.actualCash,
      cash_counts: values.cashCounts,
      work_shifts: values.workShifts,
      worker_name: values.workerName,
      note: values.note || null,
      created_by: session.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_date" },
  );

  if (error) throw error;
};
