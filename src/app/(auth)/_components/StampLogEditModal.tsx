'use client';

import { useMemo, useState } from 'react';
import Button from '@/app/_components/Button';
import {
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from '@/app/_enums/enums';
import StampLogForm, {
  StampLogValue,
} from '@/app/(auth)/customers/_components/StampLogForm';
import type { StampLogMeta } from '@/app/_domains/_stamp/_services/stampService';

const getStampAmountFromAction = (action: string) => {
  if (action === 'no-stamp') return 0;
  if (action.startsWith('add-')) {
    const amount = Number(action.replace('add-', ''));
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
};

interface StampLogEditModalProps {
  initialAction: string;
  initialPaymentType?: PaymentTypeEnumType['value'];
  initialStoreName?: StoreTypeEnumType['value'];
  initialLogMeta?: StampLogMeta | null;
  onSubmit: (values: {
    note: string;
    paymentType?: PaymentTypeEnumType['value'];
    storeName: StoreTypeEnumType['value'];
    logMeta: StampLogMeta;
  }) => Promise<void>;
  onCancel: () => void;
}

const StampLogEditModal = ({
  initialAction,
  initialPaymentType,
  initialStoreName,
  initialLogMeta,
  onSubmit,
  onCancel,
}: StampLogEditModalProps) => {
  const [stampLog, setStampLog] = useState<StampLogValue | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialValue = useMemo(
    () => ({
      paymentType: initialPaymentType,
      storeName: initialStoreName ?? StoreTypeEnum.OVAPE.value,
      amount: getStampAmountFromAction(initialAction),
      logMeta: initialLogMeta,
    }),
    [initialAction, initialLogMeta, initialPaymentType, initialStoreName],
  );

  const handleSubmit = async () => {
    if (!stampLog) return;

    try {
      setIsSubmitting(true);
      await onSubmit({
        note: stampLog.note,
        paymentType: stampLog.paymentType,
        storeName: stampLog.storeName,
        logMeta: stampLog.logMeta,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex max-h-[calc(90vh-2rem)] min-h-0 flex-col">
      <h2 className="shrink-0 text-xl font-semibold text-gray-900 mb-4">
        출고 이력 수정
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <StampLogForm
          initialValue={initialValue}
          isStampAmountEditable={false}
          onChange={setStampLog}
        />
      </div>

      <div className="shrink-0 flex justify-end gap-3 pt-4 mt-4 border-t border-gray-200">
        <Button
          variant="gray"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          취소
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || !stampLog}
        >
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  );
};

export default StampLogEditModal;
