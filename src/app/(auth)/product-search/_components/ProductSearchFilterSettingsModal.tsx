'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/app/_components/Button';
import {
  type ProductSearchFilterSettings,
  type ProductSearchUsageFilter,
  saveProductSearchFilterSettings,
} from '@/app/_domains/_item/_services/productSearchFilterSettingService';

type Props = {
  kind: 'usage' | 'soldOut';
  initialSettings: ProductSearchFilterSettings;
  onClose: () => void;
  onSaved: (settings: Partial<ProductSearchFilterSettings>) => void;
};

const usageOptions: Array<{ value: ProductSearchUsageFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'used', label: '사용' },
  { value: 'unused', label: '미사용' },
];

export default function ProductSearchFilterSettingsModal({
  kind,
  initialSettings,
  onClose,
  onSaved,
}: Props) {
  const [usageFilter, setUsageFilter] = useState(initialSettings.usageFilter);
  const [showSoldOut, setShowSoldOut] = useState(initialSettings.showSoldOut);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const settings = kind === 'usage' ? { usageFilter } : { showSoldOut };
    setSaving(true);
    try {
      await saveProductSearchFilterSettings(settings);
      onSaved(settings);
      toast.success('상품 검색 기본값을 저장했습니다.');
      onClose();
    } catch {
      toast.error('기본값을 저장하지 못했습니다. 설정 SQL 적용 여부를 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="product-search-filter-setting-title">
        <header className="border-b border-gray-100 bg-white px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="product-search-filter-setting-title" className="text-lg font-semibold text-gray-900">{kind === 'usage' ? '사용 구분' : '품절 상품'} 기본값</h2>
              <p className="mt-1 text-xs text-gray-500">모든 사용자의 상품 검색 첫 화면에 적용됩니다.</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} aria-label="닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50">×</button>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          {kind === 'usage' && <fieldset>
            <legend className="text-sm font-semibold text-gray-800">사용 구분</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {usageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={usageFilter === option.value}
                  onClick={() => setUsageFilter(option.value)}
                  className={`min-h-11 rounded-lg border text-sm font-semibold transition ${usageFilter === option.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>}

          {kind === 'soldOut' && <fieldset>
            <legend className="text-sm font-semibold text-gray-800">품절 상품</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[{ value: false, label: '미표시' }, { value: true, label: '표시' }].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={showSoldOut === option.value}
                  onClick={() => setShowSoldOut(option.value)}
                  className={`min-h-11 rounded-lg border text-sm font-semibold transition ${showSoldOut === option.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
          <Button size="sm" variant="gray" onClick={onClose} disabled={saving}>취소</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? '저장 중...' : '기본값 저장'}</Button>
        </footer>
      </section>
    </div>
  );
}
