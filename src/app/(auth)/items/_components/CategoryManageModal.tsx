'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '@/app/_components/Button';
import {
  createItemCategory,
  updateItemCategory,
  deleteItemCategory,
  getItemCountByCategory,
} from '@/app/_domains/_item/_services/itemCategoryService';
import { useItemCategories } from '@/app/_domains/_item/_hooks/useItemCategories';
import { itemKeys } from '@/app/_domains/_item/_queryKeys/itemKeys';
import { ItemCategoryType } from '@/app/_domains/_item/_types/item.types';
import toast from 'react-hot-toast';

interface CategoryManageModalProps {
  onClose: () => void;
}

type EditingState = {
  id: string;
  name: string;
  isLiquidCategory: boolean;
  liquidSaleKind: string;
};

const liquidPricingGroupOptions = [
  { value: '', label: '적용 안 함' },
  { value: 'mtl_event', label: '입호흡 · 이벤트' }, { value: 'mtl_basic', label: '입호흡 · 기본' },
  { value: 'dtl_event', label: '폐호흡 · 이벤트' }, { value: 'dtl_basic', label: '폐호흡 · 기본' },
];
const liquidPricingGroupLabel = Object.fromEntries(
  liquidPricingGroupOptions.map((option) => [option.value, option.label]),
);

const CategoryManageModal = ({
  onClose,
}: CategoryManageModalProps) => {
  const queryClient = useQueryClient();
  const { categories } = useItemCategories();
  const [newName, setNewName] = useState('');
  const [newIsLiquidCategory, setNewIsLiquidCategory] = useState(false);
  const [newLiquidSaleKind, setNewLiquidSaleKind] = useState('');
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    getItemCountByCategory().then(setItemCounts);
  }, [categories]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: itemKeys.categories() });
    queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsSubmitting(true);
    try {
      await createItemCategory({
        name: newName.trim(),
        orderIndex: categories.length + 1,
        isLiquidCategory: newIsLiquidCategory,
        liquidSaleKind: newIsLiquidCategory && newLiquidSaleKind ? newLiquidSaleKind : null,
      });
      setNewName('');
      setNewIsLiquidCategory(false);
      setNewLiquidSaleKind('');
      refresh();
      toast.success('카테고리가 추가되었습니다.');
    } catch {
      toast.error('카테고리 추가에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (category: ItemCategoryType) => {
    if (!editing || !editing.name.trim()) return;
    setIsSubmitting(true);
    try {
      await updateItemCategory({
        id: category.id,
        name: editing.name.trim(),
        orderIndex: category.order_index,
        isLiquidCategory: editing.isLiquidCategory,
        liquidSaleKind: editing.isLiquidCategory && editing.liquidSaleKind ? editing.liquidSaleKind : null,
      });
      setEditing(null);
      refresh();
      toast.success('카테고리가 수정되었습니다.');
    } catch {
      toast.error('카테고리 수정에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsSubmitting(true);
    try {
      await deleteItemCategory(id);
      refresh();
      toast.success('카테고리가 삭제되었습니다.');
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === '23503') {
        toast.error('연결된 품목이 있어 삭제할 수 없습니다.');
      } else {
        toast.error('카테고리 삭제에 실패했습니다.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-gray-900">카테고리 관리</h2>

      {/* 카테고리 목록 */}
      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
        {categories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            등록된 카테고리가 없습니다.
          </p>
        ) : (
          categories.map((category, index) => (
            <div
              key={category.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50"
            >
              {editing?.id === category.id ? (
                <>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') handleUpdate(category);
                    }}
                    autoFocus
                    className="flex-1 px-2 py-1 text-sm border border-brand-200 rounded focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                  <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-gray-700"><input type="checkbox" checked={editing.isLiquidCategory} onChange={(event) => setEditing({ ...editing, isLiquidCategory: event.target.checked })} />액상 카테고리</label>
                  {editing.isLiquidCategory && <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-700">금액 자동 적용<select value={editing.liquidSaleKind} onChange={(event) => setEditing({ ...editing, liquidSaleKind: event.target.value })} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs">{liquidPricingGroupOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
                  <Button
                    size="xs"
                    onClick={() => handleUpdate(category)}
                    disabled={isSubmitting}
                  >
                    저장
                  </Button>
                  <Button
                    size="xs"
                    variant="gray"
                    onClick={() => setEditing(null)}
                  >
                    취소
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800">
                    <span className="text-gray-400 mr-1.5">{index + 1}.</span>
                    {category.name}
                    {category.is_liquid_category && <span className="ml-1.5 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">액상</span>}
                    {category.is_liquid_category && <span className="ml-1.5 text-xs text-gray-500">금액 : {liquidPricingGroupLabel[category.liquid_sale_kind ?? '']}</span>}
                    {itemCounts[category.id] > 0 && (
                      <span className="text-gray-400 ml-1">
                        ({itemCounts[category.id]})
                      </span>
                    )}
                  </span>
                  <Button
                    size="xs"
                    variant="gray"
                    onClick={() =>
                      setEditing({ id: category.id, name: category.name, isLiquidCategory: category.is_liquid_category, liquidSaleKind: category.liquid_sale_kind ?? '' })
                    }
                  >
                    수정
                  </Button>
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => handleDelete(category.id)}
                    disabled={isSubmitting}
                  >
                    삭제
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* 새 카테고리 추가 */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') handleCreate();
          }}
          placeholder="새 카테고리 이름"
          className="flex-1 px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-gray-700"><input type="checkbox" checked={newIsLiquidCategory} onChange={(event) => setNewIsLiquidCategory(event.target.checked)} />액상 카테고리</label>
        {newIsLiquidCategory && <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-700">금액 자동 적용<select value={newLiquidSaleKind} onChange={(event) => setNewLiquidSaleKind(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs">{liquidPricingGroupOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
        <Button size="sm" onClick={handleCreate} disabled={isSubmitting || !newName.trim()}>
          추가
        </Button>
      </div>

      <div className="flex justify-end pt-1">
        <Button size="sm" variant="gray" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  );
};

export default CategoryManageModal;
