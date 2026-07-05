'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import TagHelpTooltip from '@/app/_components/TagHelpTooltip';
import TaggedContent from '@/app/_components/TaggedContent';
import {
  ManualTopCategoryType,
  ManualSubCategoryType,
  ManualType,
} from '@/app/_domains/_manual/_types/manual.types';

const schema = z.object({
  topCategoryId: z
    .string()
    .trim()
    .min(1, { message: '상위 카테고리를 선택하세요.' }),
  subCategoryId: z
    .string()
    .trim()
    .min(1, { message: '하위 카테고리를 선택하세요.' }),
  title: z
    .string()
    .trim()
    .min(1, { message: '제목을 입력하세요.' })
    .max(200),
  content: z
    .string()
    .trim()
    .min(1, { message: '내용을 입력하세요.' })
    .max(5000),
});

export type ManualFormValues = z.infer<typeof schema>;

interface ManualCreateModalProps {
  topCategories: ManualTopCategoryType[];
  subCategoriesByTop: Record<string, ManualSubCategoryType[]>;
  onSubmit: (values: ManualFormValues) => Promise<void>;
  onCancel: () => void;
  editManual?: ManualType;
}

const ManualCreateModal = ({
  topCategories,
  subCategoriesByTop,
  onSubmit,
  onCancel,
  editManual,
}: ManualCreateModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = !!editManual;

  const defaultTopCategoryId =
    editManual?.manual_sub_categories?.top_category_id ?? '';
  const defaultSubCategoryId = editManual?.sub_category_id ?? '';

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    register,
    formState: { errors },
  } = useForm<ManualFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      topCategoryId: defaultTopCategoryId,
      subCategoryId: defaultSubCategoryId,
      title: editManual?.title ?? '',
      content: editManual?.content ?? '',
    },
  });

  const topCategoryId = watch('topCategoryId');
  const content = watch('content');

  const topCategoryOptions = topCategories.map((c) => ({
    label: c.name,
    value: c.id,
  }));
  const subCategoryOptions = (subCategoriesByTop[topCategoryId] ?? []).map(
    (c) => ({ label: c.name, value: c.id }),
  );

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
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
      })}
      className="flex flex-col gap-4"
    >
      <h2 className="text-base font-semibold text-gray-900">
        {isEdit ? '매뉴얼 수정' : '매뉴얼 추가'}
      </h2>

      <div className="flex flex-col gap-3 overflow-y-auto max-h-[65vh] pr-1">
        {/* 상위 카테고리 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            상위 카테고리 <span className="text-rose-500">*</span>
          </label>
          <Controller
            name="topCategoryId"
            control={control}
            render={({ field }) => (
              <Dropdown controlledValue={field.value}>
                <Dropdown.Trigger>
                  {topCategoryOptions.find((o) => o.value === field.value)
                    ?.label ?? '선택하세요'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {topCategoryOptions.length === 0 ? (
                    <div className="px-4 py-2 text-sm text-gray-400">
                      등록된 카테고리가 없습니다.
                    </div>
                  ) : (
                    topCategoryOptions.map((option) => (
                      <Dropdown.Item
                        key={option.value}
                        option={option}
                        onSelect={(o: DropdownOption) => {
                          field.onChange(String(o.value));
                          setValue('subCategoryId', '');
                        }}
                      />
                    ))
                  )}
                </Dropdown.Content>
              </Dropdown>
            )}
          />
          {errors.topCategoryId && (
            <p className="text-xs text-rose-500">
              {errors.topCategoryId.message}
            </p>
          )}
        </div>

        {/* 하위 카테고리 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            하위 카테고리 <span className="text-rose-500">*</span>
          </label>
          <Controller
            name="subCategoryId"
            control={control}
            render={({ field }) => (
              <Dropdown controlledValue={field.value} disabled={!topCategoryId}>
                <Dropdown.Trigger>
                  {subCategoryOptions.find((o) => o.value === field.value)
                    ?.label ??
                    (topCategoryId
                      ? '선택하세요'
                      : '상위 카테고리를 먼저 선택하세요')}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {subCategoryOptions.length === 0 ? (
                    <div className="px-4 py-2 text-sm text-gray-400">
                      등록된 하위 카테고리가 없습니다.
                    </div>
                  ) : (
                    subCategoryOptions.map((option) => (
                      <Dropdown.Item
                        key={option.value}
                        option={option}
                        onSelect={(o: DropdownOption) =>
                          field.onChange(String(o.value))
                        }
                      />
                    ))
                  )}
                </Dropdown.Content>
              </Dropdown>
            )}
          />
          {errors.subCategoryId && (
            <p className="text-xs text-rose-500">
              {errors.subCategoryId.message}
            </p>
          )}
        </div>

        {/* 제목 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            제목 <span className="text-rose-500">*</span>
          </label>
          <input
            {...register('title')}
            type="text"
            placeholder="제목을 입력하세요"
            className="px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          {errors.title && (
            <p className="text-xs text-rose-500">{errors.title.message}</p>
          )}
        </div>

        {/* 내용 */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              내용 <span className="text-rose-500">*</span>
            </label>
            <TagHelpTooltip />
          </div>
          <textarea
            {...register('content')}
            rows={6}
            placeholder="매뉴얼 내용을 입력하세요"
            className="px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none font-mono"
          />
          {errors.content && (
            <p className="text-xs text-rose-500">{errors.content.message}</p>
          )}

          {content?.trim() && (
            <div className="mt-1">
              <p className="text-xs font-medium text-gray-500 mb-1">
                미리보기
              </p>
              <div className="px-3 py-2 border border-gray-100 rounded-lg bg-gray-50">
                <TaggedContent
                  content={content}
                  className="text-sm text-gray-800"
                />
              </div>
            </div>
          )}
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

export default ManualCreateModal;
