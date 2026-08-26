import supabase from "@/libs/supabaseClient";
import {
  createLog,
  withCreatedWorker,
} from "@/app/_domains/_log/_services/logService";
import {
  BreathTypeEnum,
  BreathTypeEnumType,
  LogCategoryEnum,
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from "@/app/_enums/enums";
import { confirmOutboundInventory } from "@/app/_domains/_inventory/_services/outboundInventoryService";

export interface Stamp {
  id: string;
  customer_id: string;
  count: number;
  created_at: string;
}

export type StampLogItem = {
  itemId: string;
  itemName: string;
  itemCategoryName?: string | null;
  quantity: number;
  unitPrice: number;
  adjustedUnitPrice?: number | null;
  amount: number;
  remark: string;
  lineText: string;
  inventoryAction?:
    | "out"
    | "exchange_in"
    | "exchange_out"
    | "as_exchange_out"
    | "adjustment_in"
    | "adjustment_out";
  costSourceSaleLogId?: string;
  costSourceSaleLineIndex?: number;
  adjustmentReason?: "correction" | "damage" | "loss" | "disposal";
  adjustmentType?: "correction_in" | "correction_out" | "free_in" | "loss_out";
  exchangeAdditionalAmount?: number;
  adjustmentCostSourceReceiptLineId?: string;
  adjustmentUnitCost?: number;
};

export type AdjustmentInCostOption = { source_receipt_line_id: string; arrived_on: string; supplier_name: string; received_quantity: number };
export const getAdjustmentInCostOptions = async (itemName: string) => {
  const { data, error } = await supabase.rpc("get_adjustment_in_cost_options", { p_item_name: itemName });
  if (error) throw error;
  return (data ?? []) as AdjustmentInCostOption[];
};

export type CustomerExchangeSaleOption = {
  sale_log_id: number;
  sale_line_index: number;
  sold_at: string;
  sold_quantity: number;
  available_quantity: number;
  sale_note: string | null;
};

export const getCustomerExchangeSaleOptions = async (values: {
  customerName: string;
  customerPhone: string;
  itemName: string;
}) => {
  const { data, error } = await supabase.rpc("get_customer_exchange_sale_options", {
    p_customer_name: values.customerName,
    p_customer_phone: values.customerPhone,
    p_item_name: values.itemName,
  });
  if (error) throw error;
  return (data ?? []) as CustomerExchangeSaleOption[];
};

export type StampLogMeta = {
  clientRequestId?: string;
  afterServiceId?: number;
  afterServiceOperation?: "cost" | "exchange";
  storeName?: StoreTypeEnumType["value"];
  totalAmount?: number;
  extraNote?: string;
  xCustomerName?: string;
  xPhoneLastDigits?: string;
  reservationDate?: string;
  deliveryMethod?: "store_visit" | "parcel" | "delivery";
  deliveryType?: "agency" | "self" | "customer_quick";
  parcelCarrier?: string;
  deliveryAddressSource?: "registered" | "new";
  deliveryAddress?: string;
  deliveryMemo?: string;
  deliveryBaseFee?: number;
  deliveryFee?: number;
  payments?: Array<{
    paymentType: PaymentTypeEnumType["value"];
    paymentTypeName: string;
    amount: number;
  }>;
  discount?: {
    type: string;
    name: string;
    amount: number;
    lineText: string;
  };
  items?: StampLogItem[];
  couponUse?: {
    quantity: number;
    breathType: BreathTypeEnumType["value"];
    customMemo?: string;
  };
};

export const getCouponUsageNote = (
  couponUse: NonNullable<StampLogMeta["couponUse"]>,
) => {
  const typeLabel =
    couponUse.breathType === BreathTypeEnum.MTL.value
      ? BreathTypeEnum.MTL.name
      : couponUse.breathType === BreathTypeEnum.DTL.value
        ? BreathTypeEnum.DTL.name
        : couponUse.customMemo?.trim() || BreathTypeEnum.CUSTOM.name;

  return `${typeLabel} 쿠폰 ${couponUse.quantity}장 사용`;
};

/**
 * 스탬프 추가 (count 증가)
 */
export const addStamp = async (
  customerId: string,
  amount: number = 1,
  note: string = "",
  paymentType?: PaymentTypeEnumType["value"],
  logMeta?: StampLogMeta,
) => {
  const requestMeta = {
    ...logMeta,
    clientRequestId: logMeta?.clientRequestId ?? crypto.randomUUID(),
  };
  if (!(await confirmOutboundInventory(requestMeta.items ?? []))) {
    throw new Error("출고 처리를 취소했습니다.");
  }
  const { error } = await supabase.rpc("apply_stamp_log_operation", {
    p_customer_id: customerId,
    p_stamp_delta: amount,
    p_action: amount === 0 ? "no-stamp" : `add-${amount}`,
    p_note: note,
    p_jsonb: await withCreatedWorker({ paymentType, ...requestMeta }),
  });
  if (error) throw error;
};

/**
 * 출고 예약 (스탬프 카운트는 변경하지 않고 reservation 로그만 기록)
 */
export const addReservationStamp = async (
  customerId: string,
  amount: number = 0,
  note: string = "",
  paymentType?: PaymentTypeEnumType["value"],
  logMeta?: StampLogMeta,
) => {
  const requestMeta = {
    ...logMeta,
    clientRequestId: logMeta?.clientRequestId ?? crypto.randomUUID(),
  };
  return createLog(
    LogCategoryEnum.RESERVATION.value,
    customerId,
    amount === 0 ? "no-stamp" : `add-${amount}`,
    note,
    { paymentType, ...requestMeta },
  );
};

/**
 * 예약 이력 확정 (스탬프 카운트를 적용하고 reservation → stamp 로그로 전환)
 */
export const confirmReservationStamp = async (logId: string) => {
  const { data: log, error } = await supabase
    .from("logs")
    .select("*")
    .eq("id", logId)
    .single();

  if (error) throw error;
  if (!log) throw new Error("예약 이력을 찾을 수 없습니다");

  const reservationItems = Array.isArray(log.jsonb?.items)
    ? (log.jsonb.items as StampLogItem[])
    : [];
  if (!(await confirmOutboundInventory(reservationItems, logId))) {
    throw new Error("출고 확정을 취소했습니다.");
  }

  const confirmationWorker = await withCreatedWorker({});
  const { error: updateError } = await supabase.rpc(
    "confirm_reservation_stamp_operation_v2",
    {
      p_log_id: String(logId),
      p_confirmed_worker_name:
        typeof confirmationWorker.createdWorkerName === "string"
          ? confirmationWorker.createdWorkerName
          : null,
    },
  );
  if (updateError) throw updateError;

  const couponUse = log.jsonb?.couponUse as StampLogMeta["couponUse"];
  if (couponUse?.quantity && couponUse.quantity >= 1) {
    await removeStamp(
      "coupon",
      String(log.customer_id),
      couponUse.quantity * 10,
      getCouponUsageNote(couponUse),
      PaymentTypeEnum.SHIPMENT_REMARK.value,
      (log.jsonb?.storeName as StoreTypeEnumType["value"] | undefined) ??
        StoreTypeEnum.OVAPE.value,
    );
  }
};

/**
 * 스탬프 제거 (count 감소)
 */
export const removeStamp = async (
  mode: "remove" | "coupon",
  customerId: string,
  amount: number = 1,
  note: string = "",
  paymentType?: PaymentTypeEnumType["value"],
  storeName?: StoreTypeEnumType["value"],
) => {
  const { error } = await supabase.rpc("apply_stamp_log_operation", {
    p_customer_id: customerId,
    p_stamp_delta: -amount,
    p_action: `${mode}-${amount}`,
    p_note: note,
    p_jsonb: await withCreatedWorker(
      paymentType || storeName ? { paymentType, storeName } : null,
    ),
  });
  if (error) throw error;
};

/**
 * 특정 고객의 스탬프 목록 조회
 */
export const getStampsByCustomer = async (customerId: string) => {
  const { data, error } = await supabase
    .from("stamps")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data as Stamp[];
};

/**
 * 특정 스탬프 삭제
 */
export const deleteStamp = async (stampId: string) => {
  const { error } = await supabase.from("stamps").delete().eq("id", stampId);

  if (error) throw error;
};
