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
    name: '특이사항',
  },
} as const;

export type PaymentTypeEnumType =
  (typeof PaymentTypeEnum)[keyof typeof PaymentTypeEnum];

export const LogCategoryEnum = {
  CUSTOMER: {
    value: 'customer',
    name: '고객',
  },
  STAMP: {
    value: 'stamp',
    name: '스탬프',
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

export const AfterServiceStatusEnum = {
  RECEIVED: {
    value: 'received',
    name: '접수',
  },
  EXCHANGE: {
    value: 'exchange',
    name: '교환',
  },
  RENTAL: {
    value: 'rental',
    name: '대여',
  },
  SENT_FOR_REPAIR: {
    value: 'sent_for_repair',
    name: '수리 접수',
  },
  REPAIR_RETURNED: {
    value: 'repair_returned',
    name: '수리 수령',
  },
  REPAIR_REJECTED: {
    value: 'repair_rejected',
    name: 'AS 불가',
  },
  CUSTOMER_RECEIVED: {
    value: 'customer_received',
    name: '고객 수령',
  },
  RETURNED: {
    value: 'returned',
    name: '반품 처리',
  },
  OTHER: {
    value: 'other',
    name: '기타',
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
