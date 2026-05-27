'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import Button from '@/app/_components/Button';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import { useItemCategories } from '@/app/_domains/_item/_hooks/useItemCategories';
import { useItemOptions } from '@/app/_domains/_item/_hooks/useItemOptions';
import { usePartners } from '@/app/_domains/_partner/_hooks/usePartners';

const inboundItemSchema = z.object({
  itemId: z.string().trim().min(1, { message: '품목을 선택하세요.' }),
  quantity: z
    .number({ error: '수량을 입력하세요.' })
    .int({ message: '수량은 정수로 입력하세요.' })
    .min(1, { message: '수량은 1개 이상이어야 합니다.' }),
  note: z
    .string()
    .trim()
    .max(500, { message: '메모는 500자 이하로 입력하세요.' })
    .optional(),
});

const schema = z.object({
  partnerId: z.string().trim().min(1, { message: '거래처를 선택하세요.' }),
  orderDate: z.string().trim().min(1, { message: '주문 일자를 입력하세요.' }),
  note: z
    .string()
    .trim()
    .max(500, { message: '메모는 500자 이하로 입력하세요.' })
    .optional(),
  items: z
    .array(inboundItemSchema)
    .min(1, { message: '입고 품목을 1개 이상 추가하세요.' }),
});

export type InboundCreateFormValues = z.infer<typeof schema>;

interface InboundCreateModalProps {
  onSubmit: (values: InboundCreateFormValues) => Promise<void>;
  onCancel: () => void;
}

const createEmptyItem = () => ({
  itemId: '',
  quantity: 1,
  note: '',
});

const InboundCreateModal = ({
  onSubmit,
  onCancel,
}: InboundCreateModalProps) => {
  const [itemSearchKeywords, setItemSearchKeywords] = useState<
    Record<string, string>
  >({});
  const { partners, isLoading: isPartnerLoading, error: partnerError } =
    usePartners();
  const { categories } = useItemCategories();
  const { items: itemOptions, isLoading: isItemLoading, error: itemError } =
    useItemOptions();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InboundCreateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      partnerId: '',
      orderDate: new Date().toISOString().slice(0, 10),
      note: '',
      items: [createEmptyItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const categoryNameMap = new Map(categories.map((category) => [category.id, category.name]));
  const itemDropdownOptions = itemOptions.map((item) => {
    const categoryName = item.category_id
      ? categoryNameMap.get(item.category_id) ?? '미분류'
      : '미분류';

    return {
      label: `[${categoryName}] ${item.item_name} (${item.item_code})`,
      value: item.id,
      searchText: `${categoryName} ${item.item_name} ${item.item_code}`.toLowerCase(),
    };
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex min-h-0 max-h-full w-full flex-col gap-4 overflow-hidden"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">입고 추가</h2>
          <p className="mt-1 text-sm text-gray-500">
            거래처와 주문 정보를 입력하고 입고 품목을 추가해주세요.
          </p>
        </div>
        <div className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          품목 {fields.length}건
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            거래처 <span className="text-rose-500">*</span>
          </label>
          <Controller
            name="partnerId"
            control={control}
            render={({ field }) => (
              <Dropdown controlledValue={field.value} disabled={isPartnerLoading}>
                <Dropdown.Trigger>
                  {isPartnerLoading ? '거래처 불러오는 중...' : '거래처 선택'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {partners.map((partner) => (
                    <Dropdown.Item
                      key={partner.id}
                      option={{ label: partner.name, value: partner.id }}
                      onSelect={(option: DropdownOption) =>
                        field.onChange(String(option.value))
                      }
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            )}
          />
          {errors.partnerId && (
            <p className="text-xs text-rose-500">{errors.partnerId.message}</p>
          )}
          {partnerError && <p className="text-xs text-rose-500">{partnerError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            주문 일자 <span className="text-rose-500">*</span>
          </label>
          <input
            {...register('orderDate')}
            type="date"
            className="rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          {errors.orderDate && (
            <p className="text-xs text-rose-500">{errors.orderDate.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">메모</label>
        <textarea
          {...register('note')}
          rows={2}
          placeholder="주문 관련 메모를 입력하세요"
          className="resize-none rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        {errors.note && (
          <p className="text-xs text-rose-500">{errors.note.message}</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-brand-100 bg-brand-50/40">
        <div className="flex items-center justify-between border-b border-brand-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">입고 품목</h3>
          </div>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => append(createEmptyItem())}
          >
            품목 추가
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {fields.map((field, index) => {
            const searchKeyword =
              itemSearchKeywords[field.id]?.trim().toLowerCase() ?? '';
            const filteredItemOptions = searchKeyword
              ? itemDropdownOptions.filter((option) =>
                  option.searchText.includes(searchKeyword),
                )
              : itemDropdownOptions;

            return (
              <div
                key={field.id}
                className="rounded-lg border border-brand-100 bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-semibold text-gray-600">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-800">
                      입고 품목
                    </span>
                  </div>
                  <Button
                    size="xs"
                    type="button"
                    variant="danger"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                  >
                    삭제
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_0.8fr]">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      품목 검색
                    </label>
                    <input
                      type="text"
                      value={itemSearchKeywords[field.id] ?? ''}
                      onChange={(e) =>
                        setItemSearchKeywords((prev) => ({
                          ...prev,
                          [field.id]: e.target.value,
                        }))
                      }
                      placeholder="품목명, 코드, 종류로 검색"
                      className="rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                    <p className="text-[11px] text-gray-500">
                      {filteredItemOptions.length}개 품목 검색됨
                    </p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      품목 명 <span className="text-rose-500">*</span>
                    </label>
                    <Controller
                      name={`items.${index}.itemId`}
                      control={control}
                      render={({ field }) => (
                        <Dropdown
                          controlledValue={field.value}
                          disabled={isItemLoading}
                        >
                          <Dropdown.Trigger>
                            {isItemLoading
                              ? '품목 불러오는 중...'
                              : '품목 선택'}
                          </Dropdown.Trigger>
                          <Dropdown.Content>
                            {filteredItemOptions.length > 0 ? (
                              filteredItemOptions.map((option) => (
                                <Dropdown.Item
                                  key={String(option.value)}
                                  option={{
                                    label: option.label,
                                    value: option.value,
                                  }}
                                  onSelect={(selectedOption: DropdownOption) =>
                                    field.onChange(String(selectedOption.value))
                                  }
                                />
                              ))
                            ) : (
                              <div className="px-4 py-3 text-sm text-gray-400 sm:px-6">
                                검색 결과가 없습니다.
                              </div>
                            )}
                          </Dropdown.Content>
                        </Dropdown>
                      )}
                    />
                    {errors.items?.[index]?.itemId && (
                      <p className="text-xs text-rose-500">
                        {errors.items[index]?.itemId?.message}
                      </p>
                    )}
                    {itemError && (
                      <p className="text-xs text-rose-500">{itemError}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      수량 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      {...register(`items.${index}.quantity`, {
                        setValueAs: (value) =>
                          value === '' ? value : Number(value),
                      })}
                      type="number"
                      min={1}
                      className="rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                    {errors.items?.[index]?.quantity && (
                      <p className="text-xs text-rose-500">
                        {errors.items[index]?.quantity?.message}
                      </p>
                    )}
                  </div>

                </div>

                <div className="mt-3 flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">
                    품목 메모
                  </label>
                  <textarea
                    {...register(`items.${index}.note`)}
                    rows={2}
                    placeholder="해당 품목에만 남길 메모를 입력하세요"
                    className="resize-none rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                  {errors.items?.[index]?.note && (
                    <p className="text-xs text-rose-500">
                      {errors.items[index]?.note?.message}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {errors.items?.message && (
        <p className="text-xs text-rose-500">{errors.items.message}</p>
      )}

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-2">
        <Button type="button" variant="gray" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '저장 중...' : '입고 추가'}
        </Button>
      </div>
    </form>
  );
};

export default InboundCreateModal;
