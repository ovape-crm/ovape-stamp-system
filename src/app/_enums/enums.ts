export const BreathTypeEnum = {
  MTL: {
    value: 'mtl',
    name: '입호흡',
  },
  DTL: {
    value: 'dtl',
    name: '폐호흡',
  },
  CUSTOM: {
    value: 'custom',
    name: '직접 입력',
  },
} as const;

export type BreathTypeEnumType =
  (typeof BreathTypeEnum)[keyof typeof BreathTypeEnum];

export const PaymentTypeEnum = {
  CARD: {
    value: 'card',
    name: '카드',
  },
  TRANSFER: {
    value: 'transfer',
    name: '이체',
  },
  CASH: {
    value: 'cash',
    name: '현금',
  },
  CASH_RECEIPT: {
    value: 'cash_receipt',
    name: '현금영수증',
  },
  TRANSFER_CASH_RECEIPT: {
    value: 'transfer_cash_receipt',
    name: '이체현금영수증',
  },
  REMARK: {
    value: 'remark',
    name: '고객 특이사항',
  },
  SHIPMENT_REMARK: {
    value: 'shipment_remark',
    name: '특이사항',
  },
  KAKAOTALK: {
    value: 'kakaotalk',
    name: '카카오톡',
  },
  EGU_CARD: {
    value: 'egu_card',
    name: '카드',
  },
  EGU_TRANSFER: {
    value: 'egu_transfer',
    name: '이체',
  },
  EGU_CASH_RECEIPT: {
    value: 'egu_cash_receipt',
    name: '현금영수증',
  },
} as const;

export type PaymentTypeEnumType =
  (typeof PaymentTypeEnum)[keyof typeof PaymentTypeEnum];

export const StoreTypeEnum = {
  OVAPE: {
    value: 'ovape',
    name: '오베이프',
  },
  EGU_VAPE: {
    value: 'egu_vape',
    name: '이구베이프',
  },
} as const;

export type StoreTypeEnumType =
  (typeof StoreTypeEnum)[keyof typeof StoreTypeEnum];

export const LogCategoryEnum = {
  CUSTOMER: {
    value: 'customer',
    name: '고객',
  },
  STAMP: {
    value: 'stamp',
    name: '스탬프',
  },
  RESERVATION: {
    value: 'reservation',
    name: '예약',
  },
  REMARK: {
    value: 'remark',
    name: '특이사항',
  },
  AFTER_SERVICE: {
    value: 'after_service',
    name: 'AS',
  },
} as const;

export type LogCategoryEnumType =
  (typeof LogCategoryEnum)[keyof typeof LogCategoryEnum];

export const AfterServiceStatusGroupEnum = {
  RECEIVED: {
    value: 'received',
    name: '접수',
  },
  IN_PROGRESS: {
    value: 'inProgress',
    name: '진행 중',
  },
  COMPLETED: {
    value: 'completed',
    name: '처리 완료',
  },
} as const;

export type AfterServiceStatusGroupEnumType =
  (typeof AfterServiceStatusGroupEnum)[keyof typeof AfterServiceStatusGroupEnum];

export const AfterServiceStatusEnum = {
  RECEIVED: {
    value: 'received',
    name: '접수',
    group: AfterServiceStatusGroupEnum.RECEIVED.value,
  },
  EXCHANGE: {
    value: 'exchange',
    name: '교환',
    group: AfterServiceStatusGroupEnum.IN_PROGRESS.value,
  },
  RENTAL: {
    value: 'rental',
    name: '대여',
    group: AfterServiceStatusGroupEnum.IN_PROGRESS.value,
  },
  SENT_FOR_REPAIR: {
    value: 'sent_for_repair',
    name: '수리 접수',
    group: AfterServiceStatusGroupEnum.IN_PROGRESS.value,
  },
  REPAIR_RETURNED: {
    value: 'repair_returned',
    name: '수리 입고',
    group: AfterServiceStatusGroupEnum.IN_PROGRESS.value,
  },
  REPAIR_RETURNED_COMPLETED: {
    value: 'repair_returned_completed',
    name: '수리 입고 (재고 처리)',
    group: AfterServiceStatusGroupEnum.COMPLETED.value,
  },
  REPAIR_REJECTED: {
    value: 'repair_rejected',
    name: 'AS 불가',
    group: AfterServiceStatusGroupEnum.COMPLETED.value,
  },
  CUSTOMER_RECEIVED: {
    value: 'customer_received',
    name: '고객 수령',
    group: AfterServiceStatusGroupEnum.COMPLETED.value,
  },
  RETURNED: {
    value: 'returned',
    name: '반품 처리',
    group: AfterServiceStatusGroupEnum.COMPLETED.value,
  },
  OTHER_COMPLETED: {
    value: 'other',
    name: '기타 (완료)',
    group: AfterServiceStatusGroupEnum.COMPLETED.value,
  },
  OTHER_RECEIVED: {
    value: 'other_in_progress',
    name: '기타 (진행 중)',
    group: AfterServiceStatusGroupEnum.IN_PROGRESS.value,
  },
} as const;

export type AfterServiceStatusEnumType =
  (typeof AfterServiceStatusEnum)[keyof typeof AfterServiceStatusEnum];

export const AfterServiceItemTypeEnum = {
  DEVICE: {
    value: 'device',
    name: '기기',
  },
  DISPOSABLE_DEVICE: {
    value: 'disposable_device',
    name: '일회용 기기',
  },
  LIQUID: {
    value: 'liquid',
    name: '액상',
  },
  CONSUMABLE: {
    value: 'consumable',
    name: '소모품',
  },
} as const;

export type AfterServiceItemTypeEnumType =
  (typeof AfterServiceItemTypeEnum)[keyof typeof AfterServiceItemTypeEnum];

export const ManualTabEnum = {
  CUSTOMER: {
    value: 'customer',
    name: '고객',
  },
  STORE: {
    value: 'store',
    name: '매장',
  },
} as const;

export type ManualTabEnumType =
  (typeof ManualTabEnum)[keyof typeof ManualTabEnum];
