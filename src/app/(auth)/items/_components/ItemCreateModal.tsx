'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import Button from '@/app/_components/Button';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import { ItemCategoryType, ItemType } from '@/app/_domains/_item/_types/item.types';
import toast from 'react-hot-toast';
import { getItemDeactivationImpacts, hasItemDeactivationImpact, type ItemDeactivationImpact } from '@/app/_domains/_item/_services/itemService';

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
  const [deactivationImpact, setDeactivationImpact] = useState<ItemDeactivationImpact | null>(null);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);
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

  const save = async (values: FormValues) => {
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
  };

  return (
    <form onSubmit={handleSubmit(async (values) => {
      if (editItem?.is_use && values.isUse === false) {
        try {
          setIsSubmitting(true);
          const [impact] = await getItemDeactivationImpacts([editItem.id]);
          if (impact && hasItemDeactivationImpact(impact)) {
            setPendingValues(values);
            setDeactivationImpact(impact);
            return;
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : '미사용 전환 영향을 확인하지 못했습니다.');
          return;
        } finally {
          setIsSubmitting(false);
        }
      }
      await save(values);
    })} className="relative flex flex-col gap-4">
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
        <div className="flex flex-col gap-1">
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
      {deactivationImpact && pendingValues && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-gray-950/45 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">미사용 전환 전 확인</h3>
            <p className="mt-2 text-sm text-gray-600"><strong>{deactivationImpact.itemName}</strong>에 연결된 데이터가 있습니다.</p>
            <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {deactivationImpact.stockQuantity !== 0 && <li>재고: {deactivationImpact.stockQuantity}개</li>}
              {deactivationImpact.pendingPurchaseLineCount > 0 && <li>미완료 발주: {deactivationImpact.pendingPurchaseLineCount}건</li>}
              {deactivationImpact.pendingReservationLineCount > 0 && <li>예약: {deactivationImpact.pendingReservationLineCount}건</li>}
              {deactivationImpact.liquidStandPlacementCount > 0 && <li>시연대 배치: {deactivationImpact.liquidStandPlacementCount}칸</li>}
              {deactivationImpact.activeMemoRuleCount > 0 && <li>활성 출고 메모 규칙: {deactivationImpact.activeMemoRuleCount}개</li>}
            </ul>
            <p className="mt-3 text-xs text-gray-500">미사용으로 전환해도 정산 및 기존 이력은 유지됩니다.</p>
            <div className="mt-5 flex justify-end gap-2"><Button type="button" size="sm" variant="gray" onClick={() => { setDeactivationImpact(null); setPendingValues(null); }}>취소</Button><Button type="button" size="sm" disabled={isSubmitting} onClick={() => void save(pendingValues)}>미사용으로 저장</Button></div>
          </div>
        </div>
      )}
    </form>
  );
};

export default ItemCreateModal;
