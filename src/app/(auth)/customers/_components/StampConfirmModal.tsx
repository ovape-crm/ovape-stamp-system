'use client';

import Button from '@/app/_components/Button';
import { useState } from 'react';

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
  onConfirm: (note?: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [note, setNote] = useState('');

  const title =
    mode === 'add'
      ? '스탬프 추가'
      : mode === 'remove'
      ? '스탬프 제거'
      : '10개 사용처리';
  const displayAmount = mode === 'use10' ? 10 : amount ?? 1;
  const description =
    mode === 'use10'
      ? '스탬프를 10개 사용 처리하시겠습니까?'
      : `스탬프를 ${displayAmount}개 ${
          mode === 'add' ? '추가' : '제거'
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
      ? ' (제거 사유 입력)'
      : ' (예: [입/폐호흡] 쿠폰 사용)';

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      await onConfirm(note);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-brand-500 rounded-full"></div>
            <span className="text-sm font-medium text-gray-700">대상 고객</span>
          </div>
          <p className="text-lg font-semibold text-gray-900">{target.name}</p>
          <p className="text-sm text-gray-600">{target.phone}</p>
        </div>

        <div className="text-center py-4">
          <p className="text-gray-700 text-base leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {/* 메모 입력 */}
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

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <Button variant="gray" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button disabled={isSubmitting} onClick={handleConfirm} size="sm">
          {isSubmitting ? '처리 중...' : '확인'}
        </Button>
      </div>
    </div>
  );
}
