'use client';

import Button from '@/app/_components/Button';
import {
  BreathTypeEnum,
  BreathTypeEnumType,
  PaymentTypeEnum,
  PaymentTypeEnumType,
} from '@/app/_enums/enums';
import { formatPhoneNumber } from '@/app/_utils/utils';
import { useState } from 'react';

const paymentTypeOptions = Object.values(PaymentTypeEnum).filter(
  (o) => o.value !== PaymentTypeEnum.REMARK.value,
);

export default function StampConfirmModal({
  target,
  mode,
  amount: amountProp,
  onConfirm,
  onCancel,
}: {
  target: { name: string; phone: string };
  mode: 'add' | 'remove' | 'use10';
  amount?: number;
  onConfirm: (
    note?: string,
    paymentType?: PaymentTypeEnumType['value'],
    amount?: number,
  ) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [note, setNote] = useState('');
  const [breathType, setBreathType] = useState<BreathTypeEnumType['value'] | ''>('');
  const [paymentType, setPaymentType] = useState<PaymentTypeEnumType['value'] | ''>('');
  const [amount, setAmount] = useState<number>(amountProp ?? (mode === 'remove' ? 1 : 0));

  const title =
    mode === 'add' ? '출고 이력 추가' : mode === 'remove' ? '스탬프 차감' : '쿠폰 사용';

  const labelTitle =
    mode === 'add' ? '입력 순서' : '특이 사항';

  const labelText =
    mode === 'add'
      ? '\n [리뷰/할인/(숫자)병쿠폰] ) [기기이름] [숫자] 개\n[액상이름][30/60]ml [숫자] 병 , [기기이름] [옴] [코일/팟] 개'
      : mode === 'remove'
      ? ' (차감 사유 입력)'
      : ' (예: [입/폐호흡] 쿠폰 사용)';

  const isConfirmDisabled =
    (mode === 'use10' && breathType === '') ||
    (mode === 'add' && paymentType === '');

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      await onConfirm(note, paymentType as PaymentTypeEnumType['value'], amount);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── 확인 화면 ──────────────────────────────────────────────────────────────
  if (showConfirm) {
    return (
      <div className="w-full flex flex-col min-h-0">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">{title} 확인</h2>

        <div className="overflow-y-auto min-h-0 flex-1 space-y-4">
          {/* 대상 고객 */}
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-brand-500 rounded-full" />
              <span className="text-sm font-medium text-gray-700">대상 고객</span>
            </div>
            <p className="text-lg font-semibold text-gray-900">{target.name}</p>
            <p className="text-sm text-gray-600">{formatPhoneNumber(target.phone)}</p>
          </div>

          {/* 요약 정보 */}
          <div className="bg-brand-50 rounded-lg p-4 border border-brand-200 space-y-2">
            {mode === 'add' && (
              <>
                <div>
                  <span className="text-sm font-medium text-gray-600">스탬프 개수:</span>
                  <p className="text-base font-semibold text-gray-900">
                    {amount === 0 ? '미적립' : `${amount}개`}
                  </p>
                </div>
                {paymentType && (
                  <div>
                    <span className="text-sm font-medium text-gray-600">결제 유형:</span>
                    <p className="text-base font-semibold text-gray-900">
                      {paymentTypeOptions.find((o) => o.value === paymentType)?.name}
                    </p>
                  </div>
                )}
              </>
            )}
            {mode === 'remove' && (
              <div>
                <span className="text-sm font-medium text-gray-600">차감 개수:</span>
                <p className="text-base font-semibold text-gray-900">{amount}개</p>
              </div>
            )}
            {mode === 'use10' && (
              <div>
                <span className="text-sm font-medium text-gray-600">쿠폰 사용:</span>
                <p className="text-base font-semibold text-gray-900">10개 차감</p>
              </div>
            )}
            {note && (
              <div>
                <span className="text-sm font-medium text-gray-600">메모:</span>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{note}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
          <Button
            variant="gray"
            size="sm"
            onClick={() => setShowConfirm(false)}
            disabled={isSubmitting}
          >
            수정
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? '처리 중...' : '확인'}
          </Button>
        </div>
      </div>
    );
  }

  // ── 입력 화면 ──────────────────────────────────────────────────────────────
  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>

        <div className="bg-gray-100 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-brand-500 rounded-full" />
            <span className="text-sm font-medium text-gray-700">대상 고객</span>
          </div>
          <p className="text-lg font-semibold text-gray-900">{target.name}</p>
          <p className="text-sm text-gray-600">{formatPhoneNumber(target?.phone)}</p>
        </div>

        {mode === 'use10' && (
          <div className="text-center py-4">
            <p className="text-gray-700 text-base leading-relaxed">
              쿠폰을 사용 처리 하시겠습니까? (10개 차감)
            </p>
          </div>
        )}
      </div>

      {mode === 'remove' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            차감 개수 <span className="text-rose-600">*</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^[0-9]+$/.test(v)) {
                  setAmount(v === '' ? 1 : Math.max(1, Number(v)));
                }
              }}
              className="w-16 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm text-center"
            />
            <button
              type="button"
              onClick={() => setAmount((v) => Math.max(1, v - 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors text-lg leading-none"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setAmount((v) => v + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 transition-colors text-lg leading-none"
            >
              +
            </button>
          </div>
        </div>
      )}

      {mode === 'add' && (
        <div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              스탬프 개수 <span className="text-rose-600">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={amount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^[0-9]+$/.test(v)) {
                    setAmount(v === '' ? 0 : Number(v));
                  }
                }}
                className="w-16 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm text-center"
              />
              <button
                type="button"
                onClick={() => setAmount((v) => Math.max(0, v - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors text-lg leading-none"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setAmount((v) => v + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 transition-colors text-lg leading-none"
              >
                +
              </button>
            </div>
            {amount === 0 && (
              <p className="mt-1.5 text-xs text-gray-400">
                0개 입력 시 <span className="font-medium text-gray-500">미적립</span>으로 기록됩니다.
              </p>
            )}
          </div>
          <span className="block text-sm font-medium mb-1">
            결제 유형 <span className="text-rose-600">*</span>
          </span>
          <div className="grid grid-cols-3 gap-2 mb-6 sm:flex sm:flex-wrap sm:gap-2">
            {paymentTypeOptions.map((option) => (
              <label
                key={option.value}
                className="inline-flex items-center justify-center gap-2 text-xs whitespace-nowrap"
              >
                <input
                  type="radio"
                  name="paymentType"
                  value={option.value}
                  checked={paymentType === option.value}
                  onChange={() => setPaymentType(option.value)}
                />
                {option.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {mode === 'use10' && (
        <div className="mb-6">
          <span className="block text-sm font-medium text-gray-700 mb-3">
            쿠폰 사용 유형
          </span>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant={breathType === BreathTypeEnum.MTL.value ? 'primary' : 'tertiary'}
              className="flex-1 text-center"
              onClick={() => {
                setBreathType(BreathTypeEnum.MTL.value);
                setNote('입호흡 쿠폰 사용');
              }}
            >
              입호흡
            </Button>
            <Button
              type="button"
              size="sm"
              variant={breathType === BreathTypeEnum.DTL.value ? 'primary' : 'tertiary'}
              className="flex-1 text-center"
              onClick={() => {
                setBreathType(BreathTypeEnum.DTL.value);
                setNote('폐호흡 쿠폰 사용');
              }}
            >
              폐호흡
            </Button>
            <Button
              type="button"
              size="sm"
              variant={breathType === BreathTypeEnum.CUSTOM.value ? 'primary' : 'tertiary'}
              className="flex-1 text-center"
              onClick={() => {
                setBreathType(BreathTypeEnum.CUSTOM.value);
                setNote('');
              }}
            >
              직접 입력
            </Button>
          </div>

          {breathType !== BreathTypeEnum.CUSTOM.value && (
            <p className="mt-2 text-xs text-gray-500">
              사용 유형을 선택하면 메모가 자동으로 입력됩니다.
            </p>
          )}
          {breathType === BreathTypeEnum.CUSTOM.value && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                메모 직접 입력
              </label>
              <span className="text-xs text-gray-500 whitespace-pre-line">
                (예: [액상 이름] [30/60]ml [숫자] 병, 쿠폰 사용)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors text-xs"
                placeholder="위에 해당되는 내용을 입력해주세요."
              />
            </div>
          )}
        </div>
      )}

      {mode !== 'use10' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {labelTitle}
            <span className="text-xs text-gray-500 whitespace-pre-line">
              {labelText}
            </span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors text-xs"
            placeholder="위에 해당되는 내용을 입력해주세요."
          />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <Button variant="gray" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button
          disabled={isConfirmDisabled}
          onClick={() => setShowConfirm(true)}
          size="sm"
        >
          확인
        </Button>
      </div>
    </div>
  );
}
