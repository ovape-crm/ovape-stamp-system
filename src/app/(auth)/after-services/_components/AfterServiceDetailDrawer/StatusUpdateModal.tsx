'use client';

import { useState } from 'react';
import { Controller, Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';
import Button from '@/app/_components/Button';
import KoreanDatePicker from '@/app/_components/KoreanDatePicker';
import {
  AfterServiceStatusEnum,
  AfterServiceStatusEnumType,
} from '@/app/_enums/enums';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';

type FormValues = {
  status: AfterServiceStatusEnumType['value'];
  note: string;
};

const getTodayDateValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const schema = z.object({
  status: z.enum(
    Object.values(AfterServiceStatusEnum).map((opt) => opt.value) as [
      AfterServiceStatusEnumType['value'],
      ...AfterServiceStatusEnumType['value'][]
    ],
    { message: '상태를 선택하세요.' }
  ),
  note: z
    .string()
    .trim()
    .max(500, { message: '메모는 500자 이하로 입력하세요.' }),
});

const safeResolver = (schema: z.ZodTypeAny) => async (data: unknown) => {
  try {
    const parsed = await schema.safeParseAsync(data);
    if (parsed.success) return { values: parsed.data, errors: {} };

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

interface StatusUpdateModalProps {
  currentStatus: string;
  isInventoryProcessed: boolean;
  rentalItemSummary?: string;
  onSubmit: (values: FormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const StatusUpdateModal = ({
  currentStatus,
  isInventoryProcessed,
  rentalItemSummary,
  onSubmit,
  onCancel,
  isSubmitting,
}: StatusUpdateModalProps) => {
  const [statusDate, setStatusDate] = useState(getTodayDateValue);
  const [statusMemo, setStatusMemo] = useState('');
  const [isInventoryReceiptConfirmed, setIsInventoryReceiptConfirmed] =
    useState(false);
  const [isCustomerContactConfirmed, setIsCustomerContactConfirmed] =
    useState(false);
  const [isRentalReturnConfirmed, setIsRentalReturnConfirmed] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    watch,
  } = useForm<FormValues>({
    mode: 'onChange',
    resolver: safeResolver(schema) as Resolver<FormValues, unknown>,
    defaultValues: {
      status: undefined,
      note: '',
    },
  });

  const statusOptions: DropdownOption[] = Object.values(AfterServiceStatusEnum)
    .filter((opt) => {
      if (opt.value === currentStatus) {
        return false;
      }
      if (
        opt.value === AfterServiceStatusEnum.RECEIVED.value ||
        opt.value === AfterServiceStatusEnum.EXCHANGE.value ||
        opt.value === AfterServiceStatusEnum.RENTAL.value
      ) {
        return false;
      }
      if (opt.value === AfterServiceStatusEnum.REPAIR_RETURNED.value) {
        return !isInventoryProcessed;
      }
      if (
        opt.value === AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value
      ) {
        return isInventoryProcessed;
      }
      if (opt.value === AfterServiceStatusEnum.CUSTOMER_RECEIVED.value) {
        return !isInventoryProcessed;
      }
      return true;
    })
    .map((opt) => ({
      label: opt.name,
      value: opt.value,
    }));

  const selectedStatus = watch('status');
  const currentStatusInfo = Object.values(AfterServiceStatusEnum).find(
    (opt) => opt.value === currentStatus
  );

  // 상태별 메모 가이드 텍스트
  const getStatusMemoGuide = (status: string): string => {
    switch (status) {
      case AfterServiceStatusEnum.RECEIVED.value:
        return '고객구매일 : 00/00/00\n고객접수일 : 00/00/00\n도매처 : @';
      case AfterServiceStatusEnum.EXCHANGE.value:
        return '교환일 : 00/00/00\n교환 제품명,색깔 : @';
      case AfterServiceStatusEnum.RENTAL.value:
        return '대여일 : 00/00/00\n대여 제품명,색깔 : @';
      case AfterServiceStatusEnum.SENT_FOR_REPAIR.value:
        return '접수일 : 00/00/00';
      case AfterServiceStatusEnum.REPAIR_RETURNED.value:
      case AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value:
        return '입고일 : 00/00/00';
      case AfterServiceStatusEnum.REPAIR_REJECTED.value:
      case AfterServiceStatusEnum.OTHER_COMPLETED.value:
      case AfterServiceStatusEnum.OTHER_RECEIVED.value:
        return '특이사항을 입력하세요.';
      case AfterServiceStatusEnum.CUSTOMER_RECEIVED.value:
        return '수령일 : 00/00/00';
      case AfterServiceStatusEnum.RETURNED.value:
        return '반품일 : 00/00/00';
      default:
        return '특이사항을 입력하세요.';
    }
  };

  const selectedStatusMemoGuide = getStatusMemoGuide(selectedStatus || '');
  const requiresInventoryReceiptConfirmation =
    selectedStatus === AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value;
  const requiresCustomerContactConfirmation =
    selectedStatus === AfterServiceStatusEnum.REPAIR_RETURNED.value;
  const requiresRentalReturnConfirmation =
    selectedStatus === AfterServiceStatusEnum.CUSTOMER_RECEIVED.value &&
    Boolean(rentalItemSummary);
  const structuredStatusConfig = (() => {
    switch (selectedStatus) {
      case AfterServiceStatusEnum.SENT_FOR_REPAIR.value:
        return {
          dateLabel: '접수일',
          memoPlaceholder: '메모를 입력하세요. (선택)',
          memoRequired: false,
        };
      case AfterServiceStatusEnum.REPAIR_RETURNED_COMPLETED.value:
        return {
          dateLabel: '입고일',
          memoPlaceholder: '메모를 입력하세요. (선택)',
          memoRequired: false,
        };
      case AfterServiceStatusEnum.REPAIR_RETURNED.value:
        return {
          dateLabel: '입고일',
          memoPlaceholder: '메모를 입력하세요. (선택)',
          memoRequired: false,
        };
      case AfterServiceStatusEnum.CUSTOMER_RECEIVED.value:
        return {
          dateLabel: '수령일',
          memoPlaceholder: '메모를 입력하세요. (선택)',
          memoRequired: false,
        };
      case AfterServiceStatusEnum.REPAIR_REJECTED.value:
        return {
          dateLabel: 'A/S 불가 처리일',
          memoPlaceholder: 'A/S 불가 사유를 입력해주세요.',
          memoRequired: true,
        };
      case AfterServiceStatusEnum.RETURNED.value:
        return {
          dateLabel: '반품일',
          memoPlaceholder: '반품처리 사유를 입력하세요.',
          memoRequired: true,
        };
      case AfterServiceStatusEnum.OTHER_COMPLETED.value:
        return {
          dateLabel: '완료일',
          memoPlaceholder: '기타 사유를 입력하세요.',
          memoRequired: true,
        };
      case AfterServiceStatusEnum.OTHER_RECEIVED.value:
        return {
          dateLabel: '작성일',
          memoPlaceholder: '기타 사유를 입력하세요.',
          memoRequired: true,
        };
      default:
        return null;
    }
  })();
  const handleStatusSubmit = (values: FormValues) => {
    if (structuredStatusConfig) {
      if (
        !statusDate ||
        (structuredStatusConfig.memoRequired && !statusMemo.trim()) ||
        (requiresInventoryReceiptConfirmation &&
          !isInventoryReceiptConfirmed) ||
        (requiresCustomerContactConfirmation &&
          !isCustomerContactConfirmed) ||
        (requiresRentalReturnConfirmation && !isRentalReturnConfirmed)
      ) {
        return;
      }
      const formattedDate = statusDate.replaceAll('-', '/');
      return onSubmit({
        ...values,
        note: [
          `${structuredStatusConfig.dateLabel} : ${formattedDate}`,
          statusMemo.trim(),
        ]
          .filter(Boolean)
          .join('\n'),
      });
    }
    return onSubmit(values);
  };

  return (
    <form
      onSubmit={handleSubmit(handleStatusSubmit)}
      className="w-full"
      noValidate
    >
      <h2 className="text-lg font-semibold mb-3">상태 수정</h2>

      <div className="space-y-3">
        {/* 현재 상태 */}
        <div>
          <label className="block text-sm font-medium mb-1">현재 상태</label>
          <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-brand-200 bg-white/70 px-3 py-1.5 text-left text-xs font-medium text-brand-700 shadow-sm sm:px-6 sm:py-2 sm:text-base">
            <span className="min-w-0 flex-1 truncate text-left">
              {currentStatusInfo?.name || currentStatus}
            </span>
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
          </div>
        </div>

        {/* 상태 선택 */}
        <div>
          <label className="block text-sm font-medium mb-1">
            변경할 상태 <span className="text-rose-600">*</span>
          </label>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <Dropdown>
                <Dropdown.Trigger>
                  <span className="block w-full text-left">
                    {statusOptions.find((opt) => opt.value === field.value)
                      ?.label || '선택하기'}
                  </span>
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {statusOptions.map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      onSelect={(option: DropdownOption) => {
                        field.onChange(option.value);
                        setStatusDate(getTodayDateValue());
                        setStatusMemo('');
                        setIsInventoryReceiptConfirmed(false);
                        setIsCustomerContactConfirmed(false);
                        setIsRentalReturnConfirmed(false);
                      }}
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            )}
          />
          {errors.status && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.status.message}
            </p>
          )}
        </div>

        {selectedStatus && (structuredStatusConfig ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {structuredStatusConfig.dateLabel}{' '}
                <span className="text-rose-600">*</span>
              </label>
              <KoreanDatePicker
                value={statusDate}
                onChange={setStatusDate}
                align="left"
                floating
              />
            </div>
            {requiresInventoryReceiptConfirmation && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-sm text-gray-700">
                <span className="min-w-0 flex-1">
                  입고 대기에 해당 거래처를 찾아 품목을 입고처리 해주세요.
                </span>
                <input
                  type="checkbox"
                  checked={isInventoryReceiptConfirmed}
                  onChange={(event) =>
                    setIsInventoryReceiptConfirmed(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                  disabled={isSubmitting}
                />
              </label>
            )}
            {requiresCustomerContactConfirmation && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-sm text-gray-700">
                <span className="min-w-0 flex-1">
                  고객 특이사항에 적힌대로 연락해주세요.
                </span>
                <input
                  type="checkbox"
                  checked={isCustomerContactConfirmed}
                  onChange={(event) =>
                    setIsCustomerContactConfirmed(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                  disabled={isSubmitting}
                />
              </label>
            )}
            {requiresRentalReturnConfirmation && (
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-sm text-gray-700">
                <p className="whitespace-pre-wrap break-words">
                  <span className="font-semibold">대여 품목: </span>
                  {rentalItemSummary}
                </p>
                <label className="flex cursor-pointer items-center gap-3 border-t border-gray-200 pt-2">
                  <span className="min-w-0 flex-1">매장에 다시 입고됨</span>
                  <input
                    type="checkbox"
                    checked={isRentalReturnConfirmed}
                    onChange={(event) =>
                      setIsRentalReturnConfirmed(event.target.checked)
                    }
                    className="h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                    disabled={isSubmitting}
                  />
                </label>
              </div>
            )}
            <div>
              <input
                type="text"
                value={statusMemo}
                onChange={(event) => setStatusMemo(event.target.value)}
                maxLength={500}
                className="h-10 w-full rounded border border-brand-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand-300"
                placeholder={structuredStatusConfig.memoPlaceholder}
                required={structuredStatusConfig.memoRequired}
                aria-required={structuredStatusConfig.memoRequired}
                disabled={isSubmitting}
              />
            </div>
          </div>
        ) : (
          <div>
            <span className="mb-2 block whitespace-pre-line text-xs text-gray-500">
              {selectedStatusMemoGuide}
            </span>
            <textarea
              {...register('note')}
              className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="메모를 입력하세요. (선택)"
              aria-invalid={!!errors.note || undefined}
              disabled={isSubmitting}
            />
            {errors.note && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.note.message}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
        <Button
          size="sm"
          variant="gray"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          취소
        </Button>
        <Button
          size="sm"
          type="submit"
          disabled={
            isSubmitting || !selectedStatus || selectedStatus === currentStatus
            ||
            (Boolean(structuredStatusConfig) && !statusDate) ||
            Boolean(
              structuredStatusConfig?.memoRequired && !statusMemo.trim()
            ) ||
            (requiresInventoryReceiptConfirmation &&
              !isInventoryReceiptConfirmed) ||
            (requiresCustomerContactConfirmation &&
              !isCustomerContactConfirmed) ||
            (requiresRentalReturnConfirmation && !isRentalReturnConfirmed)
          }
        >
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
};

export default StatusUpdateModal;
