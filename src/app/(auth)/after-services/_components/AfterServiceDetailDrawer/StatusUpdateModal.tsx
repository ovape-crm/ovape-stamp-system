'use client';

import { Controller, Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';
import Button from '@/app/_components/Button';
import {
  AfterServiceStatusEnum,
  AfterServiceStatusEnumType,
} from '@/app/_enums/enums';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';

type FormValues = {
  status: AfterServiceStatusEnumType['value'];
  note: string;
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
  onSubmit: (values: FormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const StatusUpdateModal = ({
  currentStatus,
  onSubmit,
  onCancel,
  isSubmitting,
}: StatusUpdateModalProps) => {
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
      status: currentStatus as AfterServiceStatusEnumType['value'],
      note: '',
    },
  });

  const statusOptions: DropdownOption[] = Object.values(
    AfterServiceStatusEnum
  ).map((opt) => ({
    label: opt.name,
    value: opt.value,
  }));

  const selectedStatus = watch('status');
  const currentStatusInfo = Object.values(AfterServiceStatusEnum).find(
    (opt) => opt.value === currentStatus
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full" noValidate>
      <h2 className="text-lg font-semibold mb-3">상태 수정</h2>

      <div className="space-y-3">
        {/* 현재 상태 */}
        <div>
          <label className="block text-sm font-medium mb-1">현재 상태</label>
          <div className="w-full rounded border border-brand-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {currentStatusInfo?.name || currentStatus}
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
                  {statusOptions.find((opt) => opt.value === field.value)
                    ?.label || '상태를 선택하세요'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {statusOptions.map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      onSelect={(option: DropdownOption) => {
                        field.onChange(option.value);
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

        {/* 메모 */}
        <div>
          <label className="block text-sm font-medium mb-1">메모</label>
          <textarea
            {...register('note')}
            className="w-full min-h-24 rounded border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="상태 변경 메모를 입력하세요 (선택사항)"
            aria-invalid={!!errors.note || undefined}
            disabled={isSubmitting}
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
          type="button"
        >
          취소
        </Button>
        <Button
          size="sm"
          type="submit"
          disabled={isSubmitting || selectedStatus === currentStatus}
        >
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
};

export default StatusUpdateModal;
