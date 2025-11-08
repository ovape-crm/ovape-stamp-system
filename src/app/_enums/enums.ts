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
