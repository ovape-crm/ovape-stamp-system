'use client';

import Button from '@/app/_components/Button';
import {
  BreathTypeEnum,
  BreathTypeEnumType,
  PaymentTypeEnumType,
} from '@/app/_enums/enums';
import type { StampLogMeta } from '@/app/_domains/_stamp/_services/stampService';
import { formatPhoneNumber } from '@/app/_utils/utils';
import { useState } from 'react';
import StampLogForm, { StampLogValue } from './StampLogForm';

const formatAmount = (value: number) => value.toLocaleString('ko-KR');

export default function StampConfirmModal({
  target,
  mode,
  amount: amountProp,
  onConfirm,
  onCancel,
}: {
  target: { name: string; phone: string };
  mode: 'add' | 'adjust' | 'use10';
  amount?: number;
  onConfirm: (
    note?: string,
    paymentType?: PaymentTypeEnumType['value'],
    amount?: number,
    logMeta?: StampLogMeta,
    adjustDirection?: 'add' | 'remove',
    isReservation?: boolean,
  ) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [note, setNote] = useState('');
  const [breathType, setBreathType] = useState<BreathTypeEnumType['value'] | ''>('');
  const [amount, setAmount] = useState<number>(amountProp ?? (mode === 'adjust' ? 1 : 0));
  const [adjustDirection, setAdjustDirection] = useState<'add' | 'remove'>('remove');
  const [stampLog, setStampLog] = useState<StampLogValue | null>(null);
  const [isReservation, setIsReservation] = useState(false);

  const title =
    mode === 'add'
      ? isReservation
        ? '출고 예약 추가'
        : '출고 이력 추가'
      : mode === 'adjust'
      ? '스탬프 조정'
      : '쿠폰 사용';

  const adjustActionLabel = adjustDirection === 'add' ? '추가' : '차감';

  const labelTitle = '특이 사항';
  const labelText = ' (조정 사유 입력)';

  const isConfirmDisabled =
    (mode === 'use10' && breathType === '') ||
    (mode === 'add' && stampLog === null);

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      if (mode === 'add') {
        if (!stampLog) return;
        await onConfirm(
          stampLog.note,
          stampLog.paymentType,
          stampLog.amount,
          stampLog.logMeta,
          undefined,
          isReservation,
        );
      } else if (mode === 'adjust') {
        await onConfirm(note, undefined, amount, undefined, adjustDirection);
      } else {
        await onConfirm(note);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmContent = (
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
          {mode === 'add' && stampLog && (
            <>
              {isReservation && (
                <div className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  예약 이력으로 저장됩니다
                </div>
              )}
              <div>
                <span className="text-sm font-medium text-gray-600">매장:</span>
                <p className="text-base font-semibold text-gray-900">
                  {stampLog.storeLabel}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">스탬프 개수:</span>
                <p className="text-base font-semibold text-gray-900">
                  {stampLog.amount === 0 ? '미적립' : `${stampLog.amount}개`}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">결제 유형:</span>
                <p className="text-base font-semibold text-gray-900">
                  {stampLog.paymentTypeName}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">금액:</span>
                <p className="text-base font-semibold text-gray-900">
                  {stampLog.finalAmountExpression || '0'} ={' '}
                  {formatAmount(stampLog.finalAmount)}
                </p>
              </div>
            </>
          )}
          {mode === 'adjust' && (
            <div>
              <span className="text-sm font-medium text-gray-600">
                {adjustActionLabel} 개수:
              </span>
              <p className="text-base font-semibold text-gray-900">{amount}개</p>
            </div>
          )}
          {mode === 'use10' && (
            <div>
              <span className="text-sm font-medium text-gray-600">쿠폰 사용:</span>
              <p className="text-base font-semibold text-gray-900">10개 차감</p>
            </div>
          )}
          {(mode === 'add' ? stampLog?.note : note) && (
            <div>
              <span className="text-sm font-medium text-gray-600">메모:</span>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {mode === 'add' ? stampLog?.note : note}
              </p>
            </div>
          )}
          {mode === 'add' && stampLog?.logMeta.extraNote && (
            <div>
              <span className="text-sm font-medium text-gray-600">
                출고 특이사항:
              </span>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">
                {stampLog.logMeta.extraNote}
              </p>
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

  // ── 입력 화면 ──────────────────────────────────────────────────────────────
  return (
    <>
    <div
      className={`w-full max-h-[calc(90vh-2rem)] min-h-0 flex-col ${
        showConfirm ? 'hidden' : 'flex'
      }`}
    >
      <div className="shrink-0 mb-4">
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

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {mode === 'adjust' && (
          <div className="mb-4">
          <span className="block text-sm font-medium text-gray-700 mb-2">
            조정 유형 <span className="text-rose-600">*</span>
          </span>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Button
              type="button"
              size="sm"
              variant={adjustDirection === 'remove' ? 'primary' : 'gray'}
              onClick={() => setAdjustDirection('remove')}
            >
              차감
            </Button>
            <Button
              type="button"
              size="sm"
              variant={adjustDirection === 'add' ? 'primary' : 'gray'}
              onClick={() => setAdjustDirection('add')}
            >
              추가
            </Button>
          </div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {adjustActionLabel} 개수 <span className="text-rose-600">*</span>
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
        <>
          <StampLogForm onChange={setStampLog} />

          <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">출고 예약</p>
              <p className="mt-0.5 text-xs text-gray-500">
                예약으로 저장하면 스탬프는 적립되지 않고, 예약 이력에서 확정 시
                출고 이력으로 반영됩니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isReservation}
              onClick={() => setIsReservation((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                isReservation ? 'bg-brand-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  isReservation ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </>
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

      {mode === 'adjust' && (
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
      </div>

      <div className="shrink-0 flex justify-end gap-3 pt-4 mt-4 border-t border-gray-200">
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
    {showConfirm && confirmContent}
    </>
  );
}
