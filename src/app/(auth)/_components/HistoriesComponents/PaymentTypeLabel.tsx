'use client';

import { useEffect, useRef, useState } from 'react';
import { PaymentTypeEnum, PaymentTypeEnumType } from '@/app/_enums/enums';

const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType['value'], string>
);

const PaymentTypeLabel = ({ jsonb }: { jsonb: Record<string, unknown> }) => {
  const [isSplitDetailOpen, setIsSplitDetailOpen] = useState(false);
  const splitDetailRef = useRef<HTMLDivElement>(null);
  const splitPayments = Array.isArray(jsonb.payments)
    ? jsonb.payments.filter(
        (
          payment,
        ): payment is {
          paymentType: PaymentTypeEnumType['value'];
          amount: number;
        } =>
          typeof payment === 'object' &&
          payment !== null &&
          typeof payment.paymentType === 'string' &&
          typeof payment.amount === 'number',
      )
    : [];

  useEffect(() => {
    if (!isSplitDetailOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        splitDetailRef.current &&
        !splitDetailRef.current.contains(event.target as Node)
      ) {
        setIsSplitDetailOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSplitDetailOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSplitDetailOpen]);

  if (splitPayments.length >= 2) {
    return (
      <div ref={splitDetailRef} className="relative w-full">
        <button
          type="button"
          aria-expanded={isSplitDetailOpen}
          onClick={() => setIsSplitDetailOpen((current) => !current)}
          className="flex h-7 w-full cursor-pointer items-center justify-center whitespace-nowrap rounded-full bg-gray-200 px-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-300"
        >
          분할결제 {splitPayments.length}건
        </button>
        {isSplitDetailOpen && (
          <div className="absolute left-0 top-full z-30 mt-1.5 min-w-44 rounded-xl border border-gray-200 bg-white p-2.5 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-gray-700">결제 상세</p>
          <div className="space-y-1.5">
            {splitPayments.map((payment, index) => (
              <div
                key={`${payment.paymentType}-${index}`}
                className="flex items-center justify-between gap-4 whitespace-nowrap text-xs"
              >
                <span className="text-gray-500">
                  {paymentTypeNameByValue[payment.paymentType]?.replace(
                    '이구베이프',
                    '',
                  )}
                </span>
                <span className="font-semibold text-gray-800">
                  {payment.amount.toLocaleString('ko-KR')}원
                </span>
              </div>
            ))}
          </div>
          </div>
        )}
      </div>
    );
  }

  const paymentTypeValue = jsonb?.paymentType as
    | PaymentTypeEnumType['value']
    | undefined;

  const paymentTypeName = paymentTypeValue
    ? paymentTypeNameByValue[paymentTypeValue]?.replace('이구베이프', '')
    : undefined;

  return (
    <span className="flex h-7 w-full items-center justify-center whitespace-nowrap rounded-full bg-gray-200 px-2 text-xs font-semibold text-gray-700">
      {paymentTypeName}
    </span>
  );
};

export default PaymentTypeLabel;
