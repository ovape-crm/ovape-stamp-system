'use client';

import { Controller, Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useState, useRef, useEffect } from 'react';
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
  isLoanerDeviceIssued: boolean;
  customerNote?: string;
  shopNote?: string;
  receivedNote?: string;
};

// ============================================================================
// 폼 검증 스키마
// ============================================================================

const schema = z.object({
  customerId: z.coerce.string().trim().optional(),
  itemType: z.enum(
    [
      AfterServiceItemTypeEnum.DEVICE.value,
      AfterServiceItemTypeEnum.DISPOSABLE_DEVICE.value,
      AfterServiceItemTypeEnum.LIQUID.value,
      AfterServiceItemTypeEnum.CONSUMABLE.value,
    ],
    { message: '기기 종류를 선택하세요.' },
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
  isLoanerDeviceIssued: z.boolean(),
  customerNote: z.coerce
    .string()
    .trim()
    .max(500, { message: '고객 특이사항은 500자 이하로 입력하세요.' })
    .optional(),
  shopNote: z.coerce
    .string()
    .trim()
    .max(500, { message: '매장 특이사항은 500자 이하로 입력하세요.' })
    .optional(),
  receivedNote: z.coerce
    .string()
    .trim()
    .min(1, { message: '접수 메모를 입력하세요.' })
    .max(500, { message: '접수 메모는 500자 이하로 입력하세요.' }),
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
  initialData,
  mode = 'create',
  onDelete,
  isAdmin = false,
}: {
  onSubmit: (values: FormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
  initialData?: {
    customerId?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    itemType: AfterServiceItemTypeEnumType['value'];
    itemName: string;
    quantity: number;
    symptom: string;
    shopNote?: string | null;
    customerNote?: string | null;
    isLoanerDeviceIssued?: boolean;
  };
  mode?: 'create' | 'edit';
  onDelete?: () => Promise<void> | void;
  isAdmin?: boolean;
}) {
  // ========================================================================
  // 상태 관리
  // ========================================================================
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState<FormValues | null>(null);
  const canSubmitRef = useRef(true); // 중복 제출 방지용
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [selectedCustomerInfo, setSelectedCustomerInfo] =
    useState<CustomerType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ========================================================================
  // React Hook Form 설정
  // ========================================================================
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    control,
    setValue,
    reset,
  } = useForm<FormValues>({
    mode: 'onChange',
    resolver: safeResolver(schema) as Resolver<FormValues, unknown>,
    defaultValues: {
      customerId: initialData?.customerId || '',
      itemType: initialData?.itemType || AfterServiceItemTypeEnum.DEVICE.value,
      itemName: initialData?.itemName || '',
      quantity: initialData?.quantity || 1,
      symptom: initialData?.symptom || '',
      isLoanerDeviceIssued: initialData?.isLoanerDeviceIssued ?? false,
      customerNote: initialData?.customerNote || '',
      shopNote: initialData?.shopNote || '',
      receivedNote: '',
    },
  });

  // 초기 데이터가 변경되면 폼 리셋
  useEffect(() => {
    if (initialData) {
      const customerId = initialData.customerId || null;
      setSelectedCustomerId(customerId);

      // 고객 정보 설정
      if (customerId && initialData.customerName) {
        const customer: CustomerType = {
          id: customerId,
          name: initialData.customerName,
          phone: initialData.customerPhone || '',
          gender: 'male',
          note: null,
          created_at: '',
          updated_at: '',
          stamps: [],
        };
        setSelectedCustomerInfo(customer);
      } else {
        setSelectedCustomerInfo(null);
      }

      reset({
        customerId: customerId || '',
        itemType: initialData.itemType,
        itemName: initialData.itemName,
        quantity: initialData.quantity,
        symptom: initialData.symptom,
        isLoanerDeviceIssued: initialData.isLoanerDeviceIssued ?? false,
        customerNote: initialData.customerNote || '',
        shopNote: initialData.shopNote || '',
      });
    } else {
      // initialData가 없으면 초기화
      setSelectedCustomerId(null);
      setSelectedCustomerInfo(null);
    }
  }, [initialData, reset]);

  // ========================================================================
  // 고객 선택 핸들러
  // ========================================================================
  const handleCustomerChange = (
    customerId: string | null,
    customer: CustomerType | null,
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
      console.log('formData', formData);
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
      <div className="w-full flex flex-col min-h-0">
        <h2 className="text-lg font-semibold mb-4 shrink-0">AS 정보 확인</h2>

        <div className="overflow-y-auto min-h-0 flex-1">
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="space-y-3">
              {selectedCustomerInfo && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    고객:
                  </span>
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
                    itemTypeOptions.find(
                      (opt) => opt.value === formData.itemType,
                    )?.name
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
              <div>
                <span className="text-sm font-medium text-gray-600">
                  재고처리 여부:
                </span>
                <p className="text-base font-semibold text-gray-900">
                  {formData.isLoanerDeviceIssued ? '예' : '아니오'}
                </p>
              </div>
              {formData.customerNote && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    고객 특이사항:
                  </span>
                  <p className="text-base text-gray-900 whitespace-pre-wrap">
                    {formData.customerNote}
                  </p>
                </div>
              )}
              {formData.shopNote && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    매장 특이사항:
                  </span>
                  <p className="text-base text-gray-900 whitespace-pre-wrap">
                    {formData.shopNote}
                  </p>
                </div>
              )}
              {mode === 'create' && formData.receivedNote && (
                <div>
                  <span className="text-sm font-medium text-gray-600">
                    접수 메모:
                  </span>
                  <p className="text-base text-gray-900 whitespace-pre-wrap">
                    {formData.receivedNote}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="text-center py-4">
            <p className="text-gray-700 text-sm">
              위 정보로 AS를 {mode === 'edit' ? '수정' : '등록'}하시겠습니까?
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
            disabled={isSubmitting || !isValid}
            onClick={handleConfirm}
            size="sm"
          >
            {isSubmitting
              ? mode === 'edit'
                ? '수정 중...'
                : '등록 중...'
              : mode === 'edit'
                ? '수정'
                : '등록'}
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
      className="w-full flex flex-col min-h-0"
      noValidate
    >
      <h2 className="text-lg font-semibold mb-3 shrink-0">
        {mode === 'edit' ? 'AS 수정' : 'AS 추가'}
      </h2>

      <div className="space-y-3 overflow-y-auto min-h-0 flex-1">
        {/* 고객 검색 */}
        <CustomerSelector
          value={selectedCustomerId}
          onChange={handleCustomerChange}
          error={errors.customerId?.message}
          initialCustomer={selectedCustomerInfo}
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

        {/* 재고처리 여부 */}
        <div>
          <span className="block text-sm font-medium mb-2">재고처리 여부</span>
          <Controller
            name="isLoanerDeviceIssued"
            control={control}
            render={({ field }) => (
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600" />
                <span className="ml-3 text-sm text-gray-700">
                  {field.value ? '예' : '아니오'}
                </span>
              </label>
            )}
          />
        </div>

        {/* 고객 특이사항 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            고객 특이사항
          </label>
          <textarea
            className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="고객 관련 특이사항을 입력하세요 (선택사항)"
            aria-invalid={!!errors.customerNote || undefined}
            {...register('customerNote')}
          />
          {errors.customerNote && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.customerNote.message}
            </p>
          )}
        </div>

        {/* 매장 특이사항 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            매장 특이사항
          </label>
          <textarea
            className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="매장 관련 특이사항을 입력하세요 (선택사항)"
            aria-invalid={!!errors.shopNote || undefined}
            {...register('shopNote')}
          />
          {errors.shopNote && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.shopNote.message}
            </p>
          )}
        </div>

        {/* 접수 메모 (생성 모드에서만) */}
        {mode === 'create' && (
          <div>
            <label className="block text-sm font-medium mb-1">
              접수 메모 <span className="text-rose-600">*</span>
              <span className="text-xs text-gray-500 whitespace-pre-line block mt-2 mb-2">
                {'고객구매일 : 00/00/00\n고객접수일 : 00/00/00\n도매처 : @'}
              </span>
            </label>
            <textarea
              className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="위에 해당되는 날짜, 특이사항을 입력해주세요."
              aria-invalid={!!errors.receivedNote || undefined}
              {...register('receivedNote')}
            />
            {errors.receivedNote && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.receivedNote.message}
              </p>
            )}
          </div>
        )}
      </div>

      <div
        className={`pt-4 border-t border-gray-200 flex mt-6 shrink-0 ${
          mode === 'edit' && onDelete && isAdmin
            ? 'justify-between'
            : 'justify-end'
        }`}
      >
        {mode === 'edit' && onDelete && isAdmin && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSubmitting}
            >
              AS 삭제
            </Button>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            size="sm"
            variant="gray"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            취소
          </Button>
          <Button size="sm" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? mode === 'edit'
                ? '수정 중...'
                : '등록 중...'
              : mode === 'edit'
                ? '수정'
                : '등록'}
          </Button>
        </div>
      </div>

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[2002] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">AS 삭제 확인</h3>
            <p className="text-gray-600 mb-6">
              정말로 이 AS를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                size="sm"
                variant="gray"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isSubmitting}
              >
                취소
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  if (onDelete) {
                    await onDelete();
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={isSubmitting}
              >
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
