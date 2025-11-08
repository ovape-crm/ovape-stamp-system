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

const paymentTypeOptions = Object.values(PaymentTypeEnum);

export default function StampConfirmModal({
  target,
  mode,
  amount,
  onConfirm,
  onCancel,
}: {
  target: { name: string; phone: string };
  mode: 'add' | 'remove' | 'use10';
  amount?: number;
  onConfirm: (
    note?: string,
    paymentType?: PaymentTypeEnumType['value']
  ) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [note, setNote] = useState('');

  const [breathType, setBreathType] = useState<
    BreathTypeEnumType['value'] | ''
  >('');

  const [paymentType, setPaymentType] = useState<
    PaymentTypeEnumType['value'] | ''
  >('');

  const title =
    mode === 'add'
      ? '스탬프 적립'
      : mode === 'remove'
      ? '스탬프 차감'
      : '쿠폰 사용';
  const displayAmount = mode === 'use10' ? 10 : amount ?? 1;
  const description =
    mode === 'use10'
      ? '쿠폰을 사용 처리 하시겠습니까? (10개 차감)'
      : `스탬프를 ${displayAmount}개 ${
          mode === 'add' ? '적립' : '차감'
        }하시겠습니까?`;

  const labelTitle =
    mode === 'add'
      ? '입력 순서'
      : mode === 'remove'
      ? '특이 사항'
      : '특이 사항';

  const labelText =
    mode === 'add'
      ? '\n [리뷰/할인/(숫자)병쿠폰] ) [기기이름] [숫자] 개\n[액상이름][30/60]ml [숫자] 병 , [기기이름] [옴] [코일/팟] 개'
      : mode === 'remove'
      ? ' (차감 사유 입력)'
      : ' (예: [입/폐호흡] 쿠폰 사용)';

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      await onConfirm(note, paymentType as PaymentTypeEnumType['value']);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>

        <div className="bg-gray-100 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-brand-500 rounded-full"></div>
            <span className="text-sm font-medium text-gray-700">대상 고객</span>
          </div>
          <p className="text-lg font-semibold text-gray-900">{target.name}</p>
          <p className="text-sm text-gray-600">
            {formatPhoneNumber(target?.phone)}
          </p>
        </div>

        <div className="text-center py-4">
          <p className="text-gray-700 text-base leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {mode === 'add' && (
        <div>
          <span className="block text-sm font-medium mb-1">
            결제 유형 <span className="text-rose-600">*</span>
          </span>
          <div className="flex items-center gap-4 mb-6">
            {paymentTypeOptions.map((option) => (
              <label
                key={option.value}
                className="inline-flex items-center gap-2 text-sm"
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

      {/* 메모 입력 또는 사용 유형 선택 */}
      {mode === 'use10' && (
        <div className="mb-6">
          <span className="block text-sm font-medium text-gray-700 mb-3">
            쿠폰 사용 유형
          </span>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant={
                breathType === BreathTypeEnum.MTL.value ? 'primary' : 'tertiary'
              }
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
              variant={
                breathType === BreathTypeEnum.DTL.value ? 'primary' : 'tertiary'
              }
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
              variant={
                breathType === BreathTypeEnum.CUSTOM.value
                  ? 'primary'
                  : 'tertiary'
              }
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
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors text-xs"
                placeholder={'위에 해당되는 내용을 입력해주세요.'}
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
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors text-xs"
            placeholder={'위에 해당되는 내용을 입력해주세요.'}
          />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <Button variant="gray" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button
          disabled={
            isSubmitting ||
            (mode === 'use10' && breathType === '') ||
            (mode === 'add' && paymentType === '')
          }
          onClick={handleConfirm}
          size="sm"
        >
          {isSubmitting ? '처리 중...' : '확인'}
        </Button>
      </div>
    </div>
  );
}
