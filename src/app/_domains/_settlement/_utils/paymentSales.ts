export type PaymentSales = {
  ovape: Record<string, number>;
  eguvape: Record<string, number>;
};

export type LivePaymentLog = {
  created_at: string;
  jsonb: unknown;
};

export type HistoricalPaymentSale = {
  store: "ovape" | "eguvape";
  payment_type: string | null;
  sales_amount: number | null;
};

export const aggregatePaymentSales = ({
  logs,
  historicalSales,
  liveRange,
}: {
  logs: LivePaymentLog[];
  historicalSales: HistoricalPaymentSale[];
  liveRange: { start: string; end: string };
}): PaymentSales => {
  const sales: PaymentSales = { ovape: {}, eguvape: {} };
  const addPayment = (paymentType: string, amount: number) => {
    if (!paymentType || !Number.isFinite(amount)) return;
    if (paymentType === "remark" || paymentType === "shipment_remark") return;
    const isEgu = paymentType.startsWith("egu_");
    const key = isEgu ? paymentType.slice(4) : paymentType;
    if (!key) return;
    const target = isEgu ? sales.eguvape : sales.ovape;
    target[key] = (target[key] ?? 0) + amount;
  };

  for (const row of logs) {
    if (row.created_at < liveRange.start || row.created_at >= liveRange.end) {
      continue;
    }
    const jsonb = (row.jsonb ?? {}) as Record<string, unknown>;
    const payments = Array.isArray(jsonb.payments)
      ? (jsonb.payments as Array<Record<string, unknown>>)
      : [];
    if (payments.length) {
      for (const payment of payments) {
        addPayment(
          String(payment.paymentType ?? ""),
          Number(payment.amount ?? 0),
        );
      }
    } else {
      addPayment(
        String(jsonb.paymentType ?? ""),
        Number(jsonb.totalAmount ?? 0),
      );
    }
  }

  for (const row of historicalSales) {
    const paymentType = String(row.payment_type ?? "");
    addPayment(
      row.store === "eguvape" && !paymentType.startsWith("egu_")
        ? `egu_${paymentType}`
        : paymentType,
      Number(row.sales_amount ?? 0),
    );
  }

  return sales;
};
