import supabase from "@/libs/supabaseClient";

export type RefundSummary = {
  refundedAmount: number;
  refundedQuantities: Record<number, number>;
};

export const getCustomerRefundSummary = async (sourceLogId: string): Promise<RefundSummary> => {
  const { data, error } = await supabase.rpc("get_customer_refund_summary", {
    p_source_log_id: sourceLogId,
  });
  if (error) throw error;

  const summary = (data ?? {}) as { refunded_amount?: unknown; refunded_quantities?: unknown };
  const quantities = summary.refunded_quantities;
  return {
    refundedAmount: Math.max(0, Number(summary.refunded_amount ?? 0)),
    refundedQuantities:
      quantities && typeof quantities === "object" && !Array.isArray(quantities)
        ? Object.entries(quantities as Record<string, unknown>).reduce<Record<number, number>>(
            (result, [index, quantity]) => ({ ...result, [Number(index)]: Math.max(0, Number(quantity)) }),
            {},
          )
        : {},
  };
};

export const createCustomerRefund = async (values: {
  sourceLogId: string; recoveryType: "none" | "normal" | "defective";
  refundAmount: number; selectedLimitAmount: number; adjustmentReason?: string;
  reason: string; memo?: string;
  lines: Array<{ sourceLineIndex: number; itemId?: string | number; itemName: string; quantity: number; grossUnitPrice: number; allocatedDiscountAmount: number; refundableAmount: number }>;
  payments: Array<{ paymentType: string; amount: number }>;
}) => {
  const { data, error } = await supabase.rpc("create_customer_refund", {
    p_source_log_id: values.sourceLogId, p_recovery_type: values.recoveryType,
    p_refund_amount: values.refundAmount, p_selected_limit_amount: values.selectedLimitAmount,
    p_adjustment_reason: values.adjustmentReason ?? null, p_reason: values.reason,
    p_memo: values.memo ?? null, p_lines: values.lines, p_payments: values.payments,
  });
  if (error) throw error;
  return String(data);
};

export const cancelCustomerRefund = async (refundId: string, reason: string) => {
  const { error } = await supabase.rpc("cancel_customer_refund", {
    p_refund_id: refundId, p_reason: reason.trim(),
  });
  if (error) throw error;
};

export const processDefectiveInventoryHold = async (values: {
  holdId: string; action: "after_service" | "supplier_return" | "scrap" | "service"; supplierId?: string; serviceCustomerId?: string; settlementType?: "supplier_credit" | "bank_refund"; settlementAmount?: number; note?: string;
}) => {
  const { data, error } = await supabase.rpc("process_defective_inventory_hold", {
    p_hold_id: values.holdId, p_action: values.action, p_supplier_id: values.supplierId ?? null,
    p_settlement_type: values.settlementType ?? null, p_settlement_amount: values.settlementAmount ?? null,
    p_note: values.note?.trim() || null, p_service_customer_id: values.serviceCustomerId ?? null,
  });
  if (error) throw error;
  return data;
};
