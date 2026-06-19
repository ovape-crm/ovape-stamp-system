'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useState, useRef } from 'react';
import Button from '@/app/_components/Button';
import { formatPhoneNumber } from '@/app/_utils/utils';
import StampLogForm, { StampLogValue } from './StampLogForm';

// ============================================================================
// 폼 검증 스키마
// ============================================================================

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: '이름을 입력하세요.' })
    .transform((v) => (v.toUpperCase() === 'X' ? 'X' : v)),
  phone: z
    .string()
    .trim()
    .min(1, { message: '전화번호를 입력하세요.' })
    .refine((v) => v.toUpperCase() === 'X' || /^[0-9]{10,11}$/.test(v), {
      message: '10-11자리 숫자만 입력하세요. (정보 없을 경우 X 입력)',
    })
    .transform((v) => (v.toUpperCase() === 'X' ? 'X' : v)),
  gender: z.enum(['male', 'female']),
  note: z
    .string()
    .trim()
    .max(500, { message: '메모는 500자 이하로 입력하세요.' })
    .optional(),
  isStampAdd: z.boolean(),
  isReservation: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export type CustomerCreateValues = FormValues & {
  stampLog: StampLogValue | null;
};

const formatAmount = (value: number) => value.toLocaleString('ko-KR');

// ============================================================================
// 컴포넌트
// ============================================================================

export default function CustomerCreateModal({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (values: CustomerCreateValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  // ========================================================================
  // 상태 관리
  // ========================================================================
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState<CustomerCreateValues | null>(null);
  const [stampLog, setStampLog] = useState<StampLogValue | null>(null);
  const canSubmitRef = useRef(true); // 중복 제출 방지용

  // ========================================================================
  // React Hook Form 설정
  // ========================================================================
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    control,
    watch,
  } = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      gender: 'male',
      note: '',
      isStampAdd: false,
      isReservation: false,
    },
  });

  const isStampAdd = watch('isStampAdd');
  const isReservation = watch('isReservation');

  // 출고 이력 추가를 선택한 경우 출고 폼이 유효해야 제출 가능
  const canSubmit = isValid && (!isStampAdd || stampLog !== null);

  // ========================================================================
  // 이벤트 핸들러
  // ========================================================================

  /**
   * 폼 제출 시 확인 화면으로 이동
   */
  const handleFormSubmit = (values: FormValues) => {
    if (!canSubmit) {
      return;
    }
    setFormData({
      ...values,
      isReservation: values.isStampAdd ? values.isReservation : false,
      stampLog: values.isStampAdd ? stampLog : null,
    });
    setShowConfirm(true);

    canSubmitRef.current = true;
  };

  /**
   * 확인 화면에서 최종 제출
   */
  const handleConfirm = async () => {
    if (!formData || !canSubmitRef.current || isSubmitting) {
      return;
    }

    canSubmitRef.current = false;

    try {
      await onSubmit(formData);
    } catch (error) {
      canSubmitRef.current = true;
      throw error;
    }
  };

  // ========================================================================
  // 확인 화면 렌더링
  // ========================================================================
  const confirmContent =
    showConfirm && formData ? (
      <div className="w-full flex flex-col min-h-0">
        <h2 className="text-lg font-semibold mb-4 shrink-0">고객 정보 확인</h2>

        <div className="overflow-y-auto min-h-0 flex-1">
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-600">이름:</span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.name}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">
                  전화번호:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.phone === 'X' ? 'X' : formatPhoneNumber(formData.phone)}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">성별:</span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.gender === 'male' ? '남자' : '여자'}
                </p>
              </div>
              {formData.note && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    특이사항:
                  </span>
                  <p className="text-base text-gray-900">{formData.note}</p>
                </div>
              )}
            </div>
          </div>

          {formData.isStampAdd && formData.stampLog && (
            <div className="bg-brand-50 rounded-lg p-4 mb-6 border border-brand-200">
              <h3 className="text-sm font-semibold text-brand-700 mb-3">
                {formData.isReservation ? '출고 예약 정보' : '출고 이력 정보'}
              </h3>
              <div className="space-y-2">
                {formData.isReservation && (
                  <div className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    예약 이력으로 저장됩니다
                  </div>
                )}
                <div>
                  <span className="text-sm font-medium text-gray-600">매장:</span>
                  <p className="text-base font-semibold text-gray-900">
                    {formData.stampLog.storeLabel}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    스탬프 개수:
                  </span>
                  <p className="text-base font-semibold text-gray-900">
                    {formData.stampLog.amount === 0
                      ? '미적립'
                      : `${formData.stampLog.amount}개`}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    결제 유형:
                  </span>
                  <p className="text-base font-semibold text-gray-900">
                    {formData.stampLog.paymentTypeName}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">금액:</span>
                  <p className="text-base font-semibold text-gray-900">
                    {formData.stampLog.finalAmountExpression || '0'} ={' '}
                    {formatAmount(formData.stampLog.finalAmount)}
                  </p>
                </div>
                {formData.stampLog.note && (
                  <div>
                    <span className="text-sm font-medium text-gray-600">메모:</span>
                    <p className="text-xs text-gray-900 whitespace-pre-wrap">
                      {formData.stampLog.note}
                    </p>
                  </div>
                )}
                {formData.stampLog.logMeta.extraNote && (
                  <div>
                    <span className="text-sm font-medium text-gray-600">
                      출고 특이사항:
                    </span>
                    <p className="text-xs text-gray-900 whitespace-pre-wrap">
                      {formData.stampLog.logMeta.extraNote}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-center py-4">
            <p className="text-gray-700 text-sm">
              위 정보로 고객을 등록하시겠습니까?
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 shrink-0">
          <Button
            onClick={() => setShowConfirm(false)}
            disabled={isSubmitting}
            size="sm"
            variant="gray"
          >
            수정
          </Button>
          <Button
            disabled={isSubmitting || !canSubmit}
            onClick={handleConfirm}
            size="sm"
          >
            {isSubmitting ? '등록 중...' : '등록'}
          </Button>
        </div>
      </div>
    ) : null;

  // ========================================================================
  // 입력 폼 렌더링
  // ========================================================================
  return (
    <>
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className={`w-full min-h-0 flex-col ${showConfirm ? 'hidden' : 'flex'}`}
      noValidate
    >
      <h2 className="text-lg font-semibold mb-3 shrink-0">고객 추가</h2>

      <div className="space-y-3 overflow-y-auto min-h-0 flex-1">
        {/* 기본 정보 입력 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            이름 <span className="text-rose-600">*</span>
          </label>
          <input
            className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="홍길동 / 정보 없을 경우 X"
            aria-invalid={!!errors.name || undefined}
            {...register('name')}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            전화번호 <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="'-' 없이 숫자만 (ex: 01012345678) / 정보 없을 경우 X"
            aria-invalid={!!errors.phone || undefined}
            {...register('phone')}
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-rose-600">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium mb-1">
            성별 <span className="text-rose-600">*</span>
          </span>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" value="male" {...register('gender')} />
              남자
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" value="female" {...register('gender')} />
              여자
            </label>
          </div>
          {errors.gender && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.gender.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">특이사항</label>
          <textarea
            className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="결제관련 특이사항, 주소지 등"
            aria-invalid={!!errors.note || undefined}
            {...register('note')}
          />
          {errors.note && (
            <p className="mt-1 text-xs text-rose-600">{errors.note.message}</p>
          )}
        </div>

        {/* 출고 이력 추가 옵션 */}
        <div>
          <span className="block text-sm font-medium mb-2">
            출고 이력 추가 <span className="text-rose-600">*</span>
          </span>
          <Controller
            name="isStampAdd"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={field.value === true}
                    onChange={() => field.onChange(true)}
                    className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-700">예</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={field.value === false}
                    onChange={() => field.onChange(false)}
                    className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-700">아니오</span>
                </label>
              </div>
            )}
          />
        </div>

        {/* 출고 이력 입력 (출고 이력 추가 선택 시에만 표시) */}
        {!!isStampAdd && (
          <div className="pt-2 border-t border-gray-200">
            <StampLogForm onChange={setStampLog} />

            <Controller
              name="isReservation"
              control={control}
              render={({ field }) => (
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
                    aria-checked={field.value}
                    onClick={() => field.onChange(!field.value)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      field.value ? 'bg-brand-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        field.value ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              )}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6 shrink-0">
        <Button
          size="sm"
          variant="gray"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button size="sm" type="submit" disabled={isSubmitting || !canSubmit}>
          {isSubmitting ? '등록 중...' : '등록'}
        </Button>
      </div>
    </form>
    {confirmContent}
    </>
  );
}
