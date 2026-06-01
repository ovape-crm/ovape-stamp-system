'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';
import {
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from '@/app/_enums/enums';

const ovapePaymentTypes = [
  PaymentTypeEnum.CARD,
  PaymentTypeEnum.TRANSFER,
  PaymentTypeEnum.CASH,
  PaymentTypeEnum.KAKAOTALK,
  PaymentTypeEnum.CASH_RECEIPT,
  PaymentTypeEnum.TRANSFER_CASH_RECEIPT,
];

const eguVapePaymentTypes = [
  PaymentTypeEnum.EGU_CARD,
  PaymentTypeEnum.EGU_TRANSFER,
  PaymentTypeEnum.EGU_CASH_RECEIPT,
];

const paymentTypesByStore: Record<
  StoreTypeEnumType['value'],
  ReadonlyArray<(typeof PaymentTypeEnum)[keyof typeof PaymentTypeEnum]>
> = {
  [StoreTypeEnum.OVAPE.value]: ovapePaymentTypes,
  [StoreTypeEnum.EGU_VAPE.value]: eguVapePaymentTypes,
};

interface StampLogEditModalProps {
  initialNote: string;
  initialPaymentType?: PaymentTypeEnumType['value'];
  initialStoreName?: StoreTypeEnumType['value'];
  onSubmit: (values: {
    note: string;
    paymentType?: PaymentTypeEnumType['value'];
    storeName: StoreTypeEnumType['value'];
  }) => Promise<void>;
  onCancel: () => void;
}

const StampLogEditModal = ({
  initialNote,
  initialPaymentType,
  initialStoreName,
  onSubmit,
  onCancel,
}: StampLogEditModalProps) => {
  const [note, setNote] = useState(initialNote);
  const [storeName, setStoreName] = useState<StoreTypeEnumType['value']>(
    initialStoreName ?? StoreTypeEnum.OVAPE.value,
  );
  const [paymentType, setPaymentType] = useState<
    PaymentTypeEnumType['value'] | undefined
  >(initialPaymentType);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const paymentTypeOptions = paymentTypesByStore[storeName] ?? [];

  const handleStoreChange = (next: StoreTypeEnumType['value']) => {
    setStoreName(next);
    const allowed = paymentTypesByStore[next] ?? [];
    if (paymentType && !allowed.some((o) => o.value === paymentType)) {
      setPaymentType(undefined);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      await onSubmit({ note, paymentType, storeName });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        출고 이력 수정
      </h2>

      <div className="space-y-5">
        <div>
          <span className="block text-sm font-medium mb-2">매장명</span>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(StoreTypeEnum).map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={storeName === option.value ? 'primary' : 'gray'}
                onClick={() => handleStoreChange(option.value)}
                disabled={isSubmitting}
              >
                {option.name}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium mb-2">결제 유형</span>
          <div className="grid grid-cols-3 gap-2">
            {paymentTypeOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={paymentType === option.value ? 'primary' : 'gray'}
                onClick={() => setPaymentType(option.value)}
                disabled={isSubmitting}
              >
                {option.name.replace('이구베이프', '')}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium mb-2">메모</span>
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⚠️ 총금액은 변경되지 않습니다. 금액 수정이 필요한 경우 이력을 삭제한
            뒤 다시 추가해주세요.
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full min-h-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm resize-y"
            placeholder="메모를 입력하세요"
            disabled={isSubmitting}
            rows={6}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
        <Button
          variant="gray"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          취소
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  );
};

export default StampLogEditModal;
