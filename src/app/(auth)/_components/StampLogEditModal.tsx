'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/app/_components/Button';
import {
  PaymentTypeEnumType,
  StoreTypeEnum,
  StoreTypeEnumType,
} from '@/app/_enums/enums';
import StampLogForm, {
  StampLogValue,
} from '@/app/(auth)/customers/_components/StampLogForm';
import TargetCustomerCard from '@/app/(auth)/customers/_components/TargetCustomerCard';
import type { StampLogMeta } from '@/app/_domains/_stamp/_services/stampService';
import { useModal } from '@/app/_contexts/ModalContext';
import { getCustomerMode } from '@/app/_domains/_customer/_utils/specialCustomer';

const getStampAmountFromAction = (action: string) => {
  if (action === 'no-stamp') return 0;
  if (action.startsWith('add-')) {
    const amount = Number(action.replace('add-', ''));
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
};

const formatAmount = (value: number) => value.toLocaleString('ko-KR');

interface StampLogEditModalProps {
  target: {
    name: string;
    phone: string;
    note?: string | null;
  };
  initialAction: string;
  initialPaymentType?: PaymentTypeEnumType['value'];
  initialStoreName?: StoreTypeEnumType['value'];
  initialLogMeta?: StampLogMeta | null;
  isStampAmountEditable?: boolean;
  title?: string;
  onSubmit: (values: {
    note: string;
    paymentType?: PaymentTypeEnumType['value'];
    storeName: StoreTypeEnumType['value'];
    logMeta: StampLogMeta;
    amount: number;
  }) => Promise<void>;
  onCancel: () => void;
}

const StampLogEditModal = ({
  target,
  initialAction,
  initialPaymentType,
  initialStoreName,
  initialLogMeta,
  isStampAmountEditable = false,
  title = '출고 이력 수정',
  onSubmit,
  onCancel,
}: StampLogEditModalProps) => {
  const { setSize } = useModal();
  const customerMode = getCustomerMode(target.name, target.phone);
  const [stampLog, setStampLog] = useState<StampLogValue | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(2);
  const [formValidity, setFormValidity] = useState({
    hasPaymentType: false,
    hasItems: false,
  });

  const initialValue = useMemo(
    () => ({
      paymentType: initialPaymentType,
      storeName: initialStoreName ?? StoreTypeEnum.OVAPE.value,
      amount: getStampAmountFromAction(initialAction),
      logMeta: initialLogMeta,
    }),
    [initialAction, initialLogMeta, initialPaymentType, initialStoreName],
  );

  useEffect(() => {
    setSize(step >= 2 ? 'max-w-5xl' : 'max-w-xl');
  }, [setSize, step]);

  const handleSubmit = async () => {
    if (!stampLog) return;

    try {
      setIsSubmitting(true);
      await onSubmit({
        note: stampLog.note,
        paymentType: stampLog.paymentType,
        storeName: stampLog.storeName,
        logMeta: stampLog.logMeta,
        amount: stampLog.amount,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex max-h-[calc(90vh-2rem)] min-h-0 w-full flex-col">
      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        aria-label="닫기"
        className="absolute right-0 top-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ×
      </button>

      <h2 className="mb-4 shrink-0 pr-8 text-xl font-semibold text-gray-900">
        {title}
      </h2>

      <div className="mb-5 flex shrink-0 items-start justify-center">
        {(['기본 정보', '품목 · 금액', '최종 확인'] as const).map(
          (label, index) => {
            const stepNumber = (index + 1) as 1 | 2 | 3;
            const isActive = step === stepNumber;
            const isDone = step > stepNumber;

            return (
              <div key={label} className="flex items-start">
                <div className="flex w-16 flex-col items-center gap-1.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      isDone
                        ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm'
                        : isActive
                          ? 'bg-brand-100 text-brand-600 ring-2 ring-brand-400'
                          : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isDone ? '✓' : stepNumber}
                  </div>
                  <span
                    className={`whitespace-nowrap text-[11px] font-medium ${
                      isActive || isDone
                        ? 'text-brand-700'
                        : 'text-gray-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {index < 2 && (
                  <div
                    className={`mt-4 h-0.5 w-8 rounded-full transition-colors sm:w-12 ${
                      isDone ? 'bg-brand-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            );
          },
        )}
      </div>

      <TargetCustomerCard
        name={target.name}
        phone={target.phone}
        note={target.note}
        className="mb-4 shrink-0"
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <StampLogForm
          initialValue={initialValue}
          isStampAmountEditable={
            customerMode !== 'x' && isStampAmountEditable
          }
          layout="split"
          step={step}
          customerMode={customerMode}
          onChange={setStampLog}
          onValidityChange={setFormValidity}
        />

        {step === 3 && stampLog && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
            <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50 p-4">
              <div>
                <span className="text-sm font-medium text-gray-600">매장:</span>
                <p className="text-base font-semibold text-gray-900">
                  {stampLog.storeLabel}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">
                  스탬프 개수:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {stampLog.amount === 0 ? '미적립' : `${stampLog.amount}개`}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">
                  결제 유형:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {stampLog.paymentTypeName}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">금액:</span>
                <p className="text-base font-semibold text-gray-900">
                  {stampLog.finalAmountExpression || '0'} ={' '}
                  {formatAmount(stampLog.finalAmount)}원
                </p>
              </div>
              {stampLog.logMeta.discount && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    할인:
                  </span>
                  <p className="text-base font-semibold text-gray-900">
                    {stampLog.logMeta.discount.name}{' '}
                    {formatAmount(stampLog.logMeta.discount.amount)}원
                  </p>
                </div>
              )}
              {stampLog.logMeta.extraNote && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    출고 특이사항:
                  </span>
                  <p className="whitespace-pre-wrap text-sm text-gray-900">
                    {stampLog.logMeta.extraNote}
                  </p>
                </div>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">
                  품목 목록{' '}
                  <span className="font-normal text-gray-500">
                    {stampLog.logMeta.items?.length ?? 0}개
                  </span>
                </p>
              </div>
              <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
                {stampLog.logMeta.items?.map((item, index) => (
                  <div
                    key={`${item.itemId}-${index}`}
                    className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2.5"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          {item.itemCategoryName ?? '미분류'}
                        </span>
                        <p className="min-w-0 break-words text-sm font-medium text-gray-900">
                          {item.lineText}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        개별단가 {formatAmount(item.unitPrice)}원 / 총금액{' '}
                        {formatAmount(item.amount)}원
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex shrink-0 justify-end gap-3 border-t border-gray-200 pt-4">
        <Button
          variant="gray"
          size="sm"
          onClick={() => {
            if (step === 1) onCancel();
            else setStep((current) => (current === 3 ? 2 : 1));
          }}
          disabled={isSubmitting}
        >
          {step === 1 ? '취소' : '이전'}
        </Button>
        {step < 3 ? (
          <Button
            size="sm"
            onClick={() => setStep((current) => (current === 1 ? 2 : 3))}
            disabled={
              step === 1
                ? !formValidity.hasPaymentType
                : !formValidity.hasItems
            }
          >
            다음
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !stampLog}
          >
            {isSubmitting ? '저장 중...' : '수정'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default StampLogEditModal;
