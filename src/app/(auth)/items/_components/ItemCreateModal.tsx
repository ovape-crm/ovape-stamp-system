'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import Button from '@/app/_components/Button';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import { ItemCategoryType, ItemType } from '@/app/_domains/_item/_types/item.types';
import toast from 'react-hot-toast';

const schema = z.object({
  categoryId: z.string().optional(),
  itemCode: z
    .string()
    .trim()
    .min(1, { message: '품목 코드를 입력하세요.' })
    .max(100),
  itemName: z
    .string()
    .trim()
    .min(1, { message: '품목 명을 입력하세요.' })
    .max(200),
  purchasePrice: z
    .number({ error: '숫자를 입력하세요.' })
    .nullable()
    .optional(),
  sellingPrice: z.number({ error: '숫자를 입력하세요.' }).nullable().optional(),
  liquidType: z.string().trim().max(100).optional(),
  liquidFlavor: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
  isUse: z.boolean().optional(),
});

export type FormValues = z.infer<typeof schema>;

interface ItemCreateModalProps {
  categories: ItemCategoryType[];
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel: () => void;
  editItem?: ItemType;
}

const ItemCreateModal = ({
  categories,
  onSubmit,
  onCancel,
  editItem,
}: ItemCreateModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = !!editItem;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editItem
      ? {
          categoryId: editItem.category_id ? String(editItem.category_id) : '',
          itemCode: editItem.item_code,
          itemName: editItem.item_name,
          purchasePrice: editItem.purchase_price,
          sellingPrice: editItem.selling_price,
          liquidType: editItem.liquid_type ?? '',
          liquidFlavor: editItem.liquid_flavor ?? '',
          note: editItem.note ?? '',
          isUse: editItem.is_use,
        }
      : {
          categoryId: '',
          itemCode: '',
          itemName: '',
          purchasePrice: null,
          sellingPrice: null,
          liquidType: '',
          liquidFlavor: '',
          note: '',
          isUse: true,
        },
  });

  const categoryOptions = [
    { label: '선택 안 함', value: '' },
    ...categories.map((c) => ({ label: c.name, value: String(c.id) })),
  ];

  return (
    <form onSubmit={handleSubmit(async (values) => {
      console.log('submit values:', values);
      try {
        setIsSubmitting(true);
        await onSubmit(values);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : '저장에 실패했습니다.',
        );
      } finally {
        setIsSubmitting(false);
      }
    }, (errors) => {
      console.log('validation errors:', errors);
    })} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-gray-900">
        {isEdit ? '품목 수정' : '품목 추가'}
      </h2>

      <div className="flex flex-col gap-3 overflow-y-auto max-h-[65vh] pr-1">
        {/* 사용 여부 (수정 모드에서만) */}
        {isEdit && (
          <Controller
            name="isUse"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">사용</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={field.value}
                  onClick={() => field.onChange(!field.value)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    field.value ? 'bg-brand-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      field.value ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
          />
        )}

        {/* 카테고리 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">품목 종류</label>
          <Controller
            name="categoryId"
            control={control}
            render={({ field }) => (
              <Dropdown controlledValue={field.value}>
                <Dropdown.Trigger>
                  {categoryOptions.find((o) => o.value === field.value)
                    ?.label ?? '선택 안 함'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {categoryOptions.map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      onSelect={(o: DropdownOption) =>
                        field.onChange(String(o.value))
                      }
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            )}
          />
        </div>

        {/* 품목 코드 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            품목 코드 <span className="text-rose-500">*</span>
          </label>
          <input
            {...register('itemCode')}
            type="text"
            placeholder="ex) P001"
            className="px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          {errors.itemCode && (
            <p className="text-xs text-rose-500">{errors.itemCode.message}</p>
          )}
        </div>

        {/* 품목 명 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            품목 명 <span className="text-rose-500">*</span>
          </label>
          <input
            {...register('itemName')}
            type="text"
            placeholder="품목 명을 입력하세요"
            className="px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          {errors.itemName && (
            <p className="text-xs text-rose-500">{errors.itemName.message}</p>
          )}
        </div>

        {/* 단가 */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-sm font-medium text-gray-700">
              매입단가
            </label>
            <input
              {...register('purchasePrice', {
                setValueAs: (v) => (v === '' ? null : Number(v)),
              })}
              type="number"
              placeholder="0"
              className="px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-sm font-medium text-gray-700">
              매출단가
            </label>
            <input
              {...register('sellingPrice', {
                setValueAs: (v) => (v === '' ? null : Number(v)),
              })}
              type="number"
              placeholder="0"
              className="px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
        </div>

        {/* 액상 */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-sm font-medium text-gray-700">
              액상 종류
            </label>
            <input
              {...register('liquidType')}
              type="text"
              placeholder="ex) 폐쇄형"
              className="px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-sm font-medium text-gray-700">액상 맛</label>
            <input
              {...register('liquidFlavor')}
              type="text"
              placeholder="ex) 민트"
              className="px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
        </div>

        {/* 비고 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">비고</label>
          <textarea
            {...register('note')}
            rows={2}
            placeholder="비고를 입력하세요"
            className="px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="button" variant="gray" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? '저장 중...' : isEdit ? '수정' : '추가'}
        </Button>
      </div>
    </form>
  );
};

export default ItemCreateModal;
