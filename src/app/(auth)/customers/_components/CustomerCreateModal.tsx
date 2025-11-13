'use client';

import { Controller, Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useState, useRef } from 'react';
import Button from '@/app/_components/Button';
import { formatPhoneNumber } from '@/app/_utils/utils';
import { PaymentTypeEnum, PaymentTypeEnumType } from '@/app/_enums/enums';

// ============================================================================
// 상수 및 타입 정의
// ============================================================================

const paymentTypeOptions = Object.values(PaymentTypeEnum);

type FormValues = {
  name: string;
  phone: string;
  gender: 'male' | 'female';
  note?: string;
  isStampAdd: boolean;
  stampAmount?: number;
  stampPaymentType?: PaymentTypeEnumType['value'];
  stampNote?: string;
};

// ============================================================================
// 폼 검증 스키마
// ============================================================================

const schema = z
  .object({
    name: z.coerce.string().trim().min(1, { message: '이름을 입력하세요.' }),
    phone: z.coerce
      .string()
      .trim()
      .min(1, { message: '전화번호를 입력하세요.' })
      .regex(/^[0-9]{10,11}$/, { message: '10-11자리 숫자만 입력하세요.' }),
    gender: z.enum(['male', 'female']),
    note: z.coerce
      .string()
      .trim()
      .max(500, { message: '메모는 500자 이하로 입력하세요.' })
      .optional(),
    isStampAdd: z.boolean(),
    stampAmount: z.coerce
      .number()
      .min(0, { message: '스탬프 개수를 입력하세요.' })
      .max(100, { message: '스탬프 개수는 100개 이하로 입력하세요.' })
      .optional(),
    stampPaymentType: z
      .enum(
        [
          PaymentTypeEnum.CARD.value,
          PaymentTypeEnum.TRANSFER.value,
          PaymentTypeEnum.CASH.value,
          PaymentTypeEnum.CASH_RECEIPT.value,
          PaymentTypeEnum.TRANSFER_CASH_RECEIPT.value,
        ],
        { message: '결제 유형을 선택하세요.' }
      )
      .optional(),
    stampNote: z.coerce
      .string()
      .trim()
      .max(500, { message: '메모는 500자 이하로 입력하세요.' })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.isStampAdd) return;

    if (data.stampAmount === 0) {
      ctx.addIssue({
        path: ['stampAmount'],
        code: z.ZodIssueCode.custom,
        message: '스탬프 개수를 입력하세요.',
      });
    }

    if (!data.stampPaymentType) {
      ctx.addIssue({
        path: ['stampPaymentType'],
        code: z.ZodIssueCode.custom,
        message: '결제 유형을 선택하세요.',
      });
    }
  });

// ============================================================================
// React Hook Form Resolver
// ============================================================================

/**
 * Zod 스키마를 React Hook Form과 호환되도록 변환하는 커스텀 resolver
 */
const safeResolver = (schema: z.ZodTypeAny) => async (data: unknown) => {
  try {
    const parsed = await schema.safeParseAsync(data);
    if (parsed.success) return { values: parsed.data, errors: {} };

    // Zod 에러를 react-hook-form 형식으로 변환
    const formattedErrors = parsed.error.format();
    const errors: Record<string, { type: string; message: string }> = {};

    Object.keys(formattedErrors).forEach((key) => {
      if (key !== '_errors' && formattedErrors[key]?._errors?.length > 0) {
        errors[key] = {
          type: 'validation',
          message: formattedErrors[key]._errors[0],
        };
      }
    });

    return { values: {}, errors };
  } catch (err) {
    console.error('[safeResolver Error]', err);
    return { values: {}, errors: {} };
  }
};

// ============================================================================
// 컴포넌트
// ============================================================================

export default function CustomerCreateModal({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (values: FormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  // ========================================================================
  // 상태 관리
  // ========================================================================
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState<FormValues | null>(null);
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
    resolver: safeResolver(schema) as Resolver<FormValues, unknown>,
    defaultValues: {
      name: '',
      phone: '',
      gender: 'male',
      note: '',
      isStampAdd: false,
      stampAmount: 0,
      stampPaymentType: undefined,
      stampNote: '',
    },
  });

  const isStampAdd = watch('isStampAdd');

  // ========================================================================
  // 이벤트 핸들러
  // ========================================================================

  /**
   * 폼 제출 시 확인 화면으로 이동
   */
  const handleFormSubmit = (values: FormValues) => {
    if (!isValid) {
      return;
    }
    setFormData(values);
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
  if (showConfirm && formData) {
    return (
      <div className="w-full">
        <h2 className="text-lg font-semibold mb-4">고객 정보 확인</h2>

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
                {formatPhoneNumber(formData?.phone)}
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

        {formData.isStampAdd && (
          <div className="bg-brand-50 rounded-lg p-4 mb-6 border border-brand-200">
            <h3 className="text-sm font-semibold text-brand-700 mb-3">
              스탬프 정보
            </h3>
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium text-gray-600">
                  스탬프 개수:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.stampAmount}개
                </p>
              </div>
              {formData.stampPaymentType && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    결제 유형:
                  </span>
                  <p className="text-base font-semibold text-gray-900">
                    {paymentTypeOptions.find(
                      (opt) => opt.value === formData.stampPaymentType
                    )?.name || formData.stampPaymentType}
                  </p>
                </div>
              )}
              {formData.stampNote && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    메모:
                  </span>
                  <p className="text-xs text-gray-900 whitespace-pre-wrap">
                    {formData.stampNote}
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

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button
            onClick={() => setShowConfirm(false)}
            disabled={isSubmitting}
            size="sm"
            variant="gray"
          >
            수정
          </Button>
          <Button
            disabled={isSubmitting || !isValid}
            onClick={handleConfirm}
            size="sm"
          >
            {isSubmitting ? '등록 중...' : '등록'}
          </Button>
        </div>
      </div>
    );
  }

  // ========================================================================
  // 입력 폼 렌더링
  // ========================================================================
  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="w-full"
      noValidate
    >
      <h2 className="text-lg font-semibold mb-3">고객 추가</h2>

      <div className="space-y-3">
        {/* 기본 정보 입력 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            이름 <span className="text-rose-600">*</span>
          </label>
          <input
            className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="홍길동"
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
            type="number"
            className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="'-' 없이 숫자만 (ex: 01012345678)"
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

        {/* 스탬프 추가 옵션 */}
        <div>
          <span className="block text-sm font-medium mb-2">
            스탬프 추가 <span className="text-rose-600">*</span>
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

        {/* 스탬프 정보 입력 (스탬프 추가 선택 시에만 표시) */}
        {!!isStampAdd && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">
                스탬프 개수 <span className="text-rose-600">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-20 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                {...register('stampAmount')}
              />
              {errors.stampAmount && (
                <p className="mt-1 text-xs text-rose-600">
                  {errors.stampAmount.message}
                </p>
              )}
            </div>
            <div>
              <span className="block text-sm font-medium mb-1">
                결제 유형 <span className="text-rose-600">*</span>
              </span>
              <Controller
                name="stampPaymentType"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-4">
                    {paymentTypeOptions.map((option) => (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 text-xs whitespace-nowrap cursor-pointer"
                      >
                        <input
                          type="radio"
                          value={option.value}
                          checked={field.value === option.value}
                          onChange={() => field.onChange(option.value)}
                          className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                        />
                        {option.name}
                      </label>
                    ))}
                  </div>
                )}
              />
              {errors.stampPaymentType && (
                <p className="mt-1 text-xs text-rose-600">
                  {errors.stampPaymentType.message}
                </p>
              )}
            </div>

            <div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  입력 순서
                  <span className="text-xs text-gray-500 whitespace-pre-line">
                    <br />
                    [리뷰/할인/(숫자)병쿠폰] ) [기기이름] [숫자] 개
                    <br />
                    [액상이름][30/60]ml [숫자] 병 , [기기이름] [옴] [코일/팟] 개
                  </span>
                </label>
                <textarea
                  {...register('stampNote')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors text-xs"
                  placeholder={'위에 해당되는 내용을 입력해주세요.'}
                />
                {errors.stampNote && (
                  <p className="mt-1 text-xs text-rose-600">
                    {errors.stampNote.message}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
        <Button
          size="sm"
          variant="gray"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button size="sm" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '등록 중...' : '등록'}
        </Button>
      </div>
    </form>
  );
}
