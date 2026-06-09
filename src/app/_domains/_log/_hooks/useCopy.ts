import {
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from '@/app/_enums/enums';
import { LogBaseType } from '../_types/log.types';
import { formatPhoneNumber } from '@/app/_utils/utils';
import toast from 'react-hot-toast';

const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType['value'], string>
);

const storeNameByValue = Object.values(StoreTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as StoreTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<StoreTypeEnumType['value'], string>
);

const buildAmountFormula = (
  jsonb: Record<string, unknown> | null | undefined,
): string => {
  if (!jsonb) return '';

  const items = Array.isArray(jsonb.items)
    ? (jsonb.items as Array<{
        unitPrice?: unknown;
        adjustedUnitPrice?: unknown;
        quantity?: unknown;
        amount?: unknown;
      }>)
    : [];
  const discount = jsonb.discount as { amount?: unknown } | undefined;
  const discountAmount =
    typeof discount?.amount === 'number' ? discount.amount : 0;
  const totalAmount =
    typeof jsonb.totalAmount === 'number' ? jsonb.totalAmount : undefined;

  const parts: string[] = [];

  if (discountAmount > 0) {
    parts.push(`-${discountAmount}`);
  }

  for (const item of items) {
    const amount = typeof item.amount === 'number' ? item.amount : 0;
    const effectiveUnitPrice =
      typeof item.adjustedUnitPrice === 'number'
        ? item.adjustedUnitPrice
        : typeof item.unitPrice === 'number'
        ? item.unitPrice
        : 0;
    if (amount <= 0 || effectiveUnitPrice <= 0) continue;
    const quantity =
      typeof item.quantity === 'number' && item.quantity > 0
        ? item.quantity
        : 1;
    parts.push(`+${effectiveUnitPrice}${quantity > 1 ? `*${quantity}` : ''}`);
  }

  if (parts.length === 0) {
    return typeof totalAmount === 'number' ? String(totalAmount) : '';
  }

  const formula = parts.join('').replace(/^\+/, '');
  return `=${formula}`;
};

const useCopy = () => {
  const copyLogToClipboard = async (
    log: LogBaseType,
    targetUser: { name: string; phone: string; gender?: 'male' | 'female' | null },
    paymentTypeLabelOverride?: string,
  ) => {
    const paymentTypeValue = log.jsonb?.paymentType as
      | PaymentTypeEnumType['value']
      | undefined;

    const basePaymentTypeName = paymentTypeLabelOverride
      ?? (paymentTypeValue ? paymentTypeNameByValue[paymentTypeValue] : undefined);

    const isEguPayment =
      typeof paymentTypeValue === 'string' && paymentTypeValue.startsWith('egu_');
    const paymentTypeName =
      basePaymentTypeName && !paymentTypeLabelOverride && isEguPayment
        ? `${StoreTypeEnum.EGU_VAPE.name}${basePaymentTypeName}`
        : basePaymentTypeName;

    const storeValue = log.jsonb?.storeName as
      | StoreTypeEnumType['value']
      | undefined;
    const storeName = storeValue
      ? storeNameByValue[storeValue]
      : StoreTypeEnum.OVAPE.name;

    const amountFormula = buildAmountFormula(log.jsonb);

    const name = targetUser.name || '이름 없음';
    const phone = formatPhoneNumber(targetUser.phone);
    const genderText = targetUser.gender === 'male' ? '남자' : targetUser.gender === 'female' ? '여자' : '';
    const baseGender = genderText ? `(숫자),${genderText}` : '';
    const extraNoteValue = log.jsonb?.extraNote;
    const extraNote =
      typeof extraNoteValue === 'string' ? extraNoteValue.trim() : '';
    const gender = extraNote
      ? `${baseGender}${baseGender ? ',' : ''}${extraNote}`
      : baseGender;

    const createdAt = new Date(log.created_at);
    const formattedDate = `${createdAt.getFullYear()}. ${String(
      createdAt.getMonth() + 1
    ).padStart(2, '0')}. ${createdAt.getDate()}`;

    const textToCopy = `${storeName}\t${formattedDate}\t${log.note}\t\t${amountFormula}\t${
      paymentTypeName ?? ''
    }\t${name}\t${phone}\t${gender}`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success('클립보드에 복사되었습니다!');
    } catch (err) {
      toast.error('복사에 실패했습니다.');
      console.error('Failed to copy:', err);
    }
  };

  return { copyLogToClipboard };
};

export default useCopy;
