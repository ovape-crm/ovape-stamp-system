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
} as const;

export type LogCategoryEnumType =
  (typeof LogCategoryEnum)[keyof typeof LogCategoryEnum];
