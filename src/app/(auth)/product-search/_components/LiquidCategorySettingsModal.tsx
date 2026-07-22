'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import { useItemCategories } from '@/app/_domains/_item/_hooks/useItemCategories';
import {
  liquidCategorySettingKey,
  saveLiquidSearchCategoryIds,
} from '@/app/_domains/_item/_services/productSearchCategoryService';

type Props = {
  initialCategoryIds: string[];
  onClose: () => void;
};

export default function LiquidCategorySettingsModal({ initialCategoryIds, onClose }: Props) {
  const queryClient = useQueryClient();
  const { categories, isLoading } = useItemCategories();
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialCategoryIds));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  const toggleCategory = (categoryId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveLiquidSearchCategoryIds([...selectedIds]);
      await queryClient.invalidateQueries({ queryKey: liquidCategorySettingKey });
      toast.success('액상 검색 기준을 저장했습니다.');
      onClose();
    } catch {
      toast.error('설정을 저장하지 못했습니다. 설정 SQL 적용 여부를 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-sm"
      onPointerDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}
    >
      <section className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="liquid-setting-title">
        <header className="border-b border-gray-100 bg-white px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <h2 id="liquid-setting-title" className="text-lg font-semibold text-gray-900">액상 검색 기준</h2>
            <button type="button" onClick={onClose} disabled={saving} aria-label="닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">×</button>
          </div>
        </header>

        <div className="overflow-y-auto p-5 sm:p-7">
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-brand-800">선택된 품목 종류</p>
              <p className="mt-0.5 text-xs text-brand-600">선택하지 않은 종류는 ‘나머지 검색’에 표시됩니다.</p>
            </div>
            <span className="rounded-full bg-brand-600 px-3 py-1.5 text-sm font-bold text-white shadow-sm">{selectedIds.size}개</span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-sm text-gray-500">품목 종류를 불러오는 중...</div>
          ) : categories.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((category) => {
                const categoryId = String(category.id);
                const selected = selectedIds.has(categoryId);
                return (
                  <button
                    key={categoryId}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleCategory(categoryId)}
                    className={`group flex min-h-16 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.99] ${selected ? 'border-brand-500 bg-brand-50 shadow-sm' : 'border-gray-100 bg-gray-50 hover:border-brand-200 hover:bg-white'}`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-black transition ${selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-300 bg-white text-transparent group-hover:border-brand-300'}`}>✓</span>
                    <span className={`text-sm font-semibold ${selected ? 'text-brand-800' : 'text-gray-700'}`}>{category.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">등록된 품목 종류가 없습니다.</div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-7">
          <button type="button" onClick={onClose} disabled={saving} className="min-h-12 rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50">취소</button>
          <Button size="md" onClick={save} disabled={saving || isLoading} className="min-h-12">{saving ? '저장 중...' : '설정 저장'}</Button>
        </footer>
      </section>
    </div>
  );
}
