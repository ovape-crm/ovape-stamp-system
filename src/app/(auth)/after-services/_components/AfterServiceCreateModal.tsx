'use client';

import { Controller, Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useState, useRef } from 'react';
import Button from '@/app/_components/Button';
import {
  AfterServiceItemTypeEnum,
  AfterServiceItemTypeEnumType,
} from '@/app/_enums/enums';
import CustomerSelector from './CustomerSelector';
import { CustomerType } from '@/app/_types/customer.types';
import { formatPhoneNumber } from '@/app/_utils/utils';

// ============================================================================
// 상수 및 타입 정의
// ============================================================================

const itemTypeOptions = Object.values(AfterServiceItemTypeEnum);

type FormValues = {
  customerId: string;
  itemType: AfterServiceItemTypeEnumType['value'];
  itemName: string;
  quantity: number;
  symptom: string;
  note?: string;
};

// ============================================================================
// 폼 검증 스키마
// ============================================================================

const schema = z.object({
  customerId: z.coerce
    .string()
    .trim()
    .min(1, { message: '고객을 선택하세요.' }),
  itemType: z.enum(
    [
      AfterServiceItemTypeEnum.DEVICE.value,
      AfterServiceItemTypeEnum.DISPOSABLE_DEVICE.value,
      AfterServiceItemTypeEnum.LIQUID.value,
      AfterServiceItemTypeEnum.CONSUMABLE.value,
    ],
    { message: '기기 종류를 선택하세요.' }
  ),
  itemName: z
    .string()
    .trim()
    .min(1, { message: '기기/제품 이름을 입력하세요.' })
    .max(100, { message: '기기/제품 이름은 100자 이하로 입력하세요.' }),
  quantity: z.coerce
    .number()
    .min(1, { message: '수량은 1개 이상이어야 합니다.' })
    .max(1000, { message: '수량은 1000개 이하로 입력하세요.' }),
  symptom: z
    .string()
    .trim()
    .min(1, { message: '증상을 입력하세요.' })
    .max(500, { message: '증상은 500자 이하로 입력하세요.' }),
  note: z.coerce
    .string()
    .trim()
    .max(500, { message: '메모는 500자 이하로 입력하세요.' })
    .optional(),
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

export default function AfterServiceCreateModal({
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
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
  );
  const [selectedCustomerInfo, setSelectedCustomerInfo] =
    useState<CustomerType | null>(null);

  // ========================================================================
  // React Hook Form 설정
  // ========================================================================
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    control,
    setValue,
  } = useForm<FormValues>({
    mode: 'onChange',
    resolver: safeResolver(schema) as Resolver<FormValues, unknown>,
    defaultValues: {
      customerId: '',
      itemType: AfterServiceItemTypeEnum.DEVICE.value,
      itemName: '',
      quantity: 1,
      symptom: '',
      note: '',
    },
  });

  // ========================================================================
  // 고객 선택 핸들러
  // ========================================================================
  const handleCustomerChange = (
    customerId: string | null,
    customer: CustomerType | null
  ) => {
    setSelectedCustomerId(customerId);
    setSelectedCustomerInfo(customer);
    // customerId를 string으로 확실히 변환
    const customerIdString = customerId ? String(customerId) : '';
    setValue('customerId', customerIdString, { shouldValidate: true });
  };

  // ========================================================================
  // 이벤트 핸들러
  // ========================================================================

  /**
   * 폼 제출 시 확인 화면으로 이동
   */
  const handleFormSubmit = (values: FormValues) => {
    if (!isValid || !selectedCustomerId) {
      if (!selectedCustomerId) {
        setValue('customerId', '');
      }
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
        <h2 className="text-lg font-semibold mb-4">AS 정보 확인</h2>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="space-y-3">
            {selectedCustomerInfo && (
              <div>
                <span className="text-sm font-medium text-gray-600">고객:</span>
                <p className="text-base font-semibold text-gray-900">
                  {selectedCustomerInfo.name} (
                  {formatPhoneNumber(selectedCustomerInfo.phone)})
                </p>
              </div>
            )}
            <div>
              <span className="text-sm font-medium text-gray-600">
                기기 종류:
              </span>
              <p className="text-base font-semibold text-gray-900">
                {
                  itemTypeOptions.find((opt) => opt.value === formData.itemType)
                    ?.name
                }
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">
                기기/제품 이름:
              </span>
              <p className="text-base font-semibold text-gray-900">
                {formData.itemName}
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">수량:</span>
              <p className="text-base font-semibold text-gray-900">
                {formData.quantity}개
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">증상:</span>
              <p className="text-base text-gray-900 whitespace-pre-wrap">
                {formData.symptom}
              </p>
            </div>
            {formData.note && (
              <div>
                <span className="text-sm font-medium text-gray-600">메모:</span>
                <p className="text-base text-gray-900 whitespace-pre-wrap">
                  {formData.note}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="text-center py-4">
          <p className="text-gray-700 text-sm">
            위 정보로 AS를 등록하시겠습니까?
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
      <h2 className="text-lg font-semibold mb-3">AS 추가</h2>

      <div className="space-y-3">
        {/* 고객 검색 */}
        <CustomerSelector
          value={selectedCustomerId}
          onChange={handleCustomerChange}
          error={errors.customerId?.message}
          required
        />

        {/* 기기 종류 선택 (Radio) */}
        <div>
          <span className="block text-sm font-medium mb-1">
            기기 종류 <span className="text-rose-600">*</span>
          </span>
          <Controller
            name="itemType"
            control={control}
            render={({ field }) => (
              <div className="flex flex-wrap items-center gap-4">
                {itemTypeOptions.map((option) => (
                  <label
                    key={option.value}
                    className="inline-flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      value={option.value}
                      checked={field.value === option.value}
                      onChange={() => field.onChange(option.value)}
                      className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                    />
                    <span className="text-sm text-gray-700">{option.name}</span>
                  </label>
                ))}
              </div>
            )}
          />
          {errors.itemType && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.itemType.message}
            </p>
          )}
        </div>

        {/* 기기/제품 이름 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            기기/제품 이름 <span className="text-rose-600">*</span>
          </label>
          <input
            className="w-full rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="기기 또는 제품 이름을 입력하세요"
            aria-invalid={!!errors.itemName || undefined}
            {...register('itemName')}
          />
          {errors.itemName && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.itemName.message}
            </p>
          )}
        </div>

        {/* 수량 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            수량 <span className="text-rose-600">*</span>
          </label>
          <input
            type="number"
            min="1"
            max="1000"
            className="w-20 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            aria-invalid={!!errors.quantity || undefined}
            {...register('quantity')}
          />
          {errors.quantity && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.quantity.message}
            </p>
          )}
        </div>

        {/* 증상 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            증상 <span className="text-rose-600">*</span>
          </label>
          <textarea
            className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="AS 증상을 입력하세요"
            aria-invalid={!!errors.symptom || undefined}
            {...register('symptom')}
          />
          {errors.symptom && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.symptom.message}
            </p>
          )}
        </div>

        {/* 메모 */}
        <div>
          <label className="block text-sm font-medium mb-1">메모</label>
          <textarea
            className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="추가 메모를 입력하세요 (선택사항)"
            aria-invalid={!!errors.note || undefined}
            {...register('note')}
          />
          {errors.note && (
            <p className="mt-1 text-xs text-rose-600">{errors.note.message}</p>
          )}
        </div>
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
