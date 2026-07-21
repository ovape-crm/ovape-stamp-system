'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Loading from '@/app/_components/Loading';
import { getProductSearchItems } from '@/app/_domains/_item/_services/productSearchService';

type SearchMode = 'liquid' | 'other';
type SearchValues = { itemName: string; second: string; third: string };

const LIQUID_CATEGORIES = new Set([
  '입호흡액상-기본',
  '입호흡액상-예약',
  '입호흡액상-이벤트',
  '폐호흡액상-기본',
  '폐호흡액상-이벤트',
  '폐호흡액상-예약',
]);

const headerCellClass = 'border border-brand-200 px-4 py-3 text-left';
const bodyCellClass = 'border border-gray-200 px-4 py-3 align-middle';

export default function ProductSearchPage() {
  const [mode, setMode] = useState<SearchMode>('liquid');
  const [searchValues, setSearchValues] = useState<Record<SearchMode, SearchValues>>({
    liquid: { itemName: '', second: '', third: '' },
    other: { itemName: '', second: '', third: '' },
  });
  const query = useQuery({ queryKey: ['product-search'], queryFn: getProductSearchItems });
  const activeSearch = searchValues[mode];

  const items = useMemo(() => {
    const normalize = (value: string | null | undefined) => value?.trim().toLocaleLowerCase('ko-KR') ?? '';
    const itemNameKeyword = normalize(activeSearch.itemName);
    const secondKeyword = normalize(activeSearch.second);
    const thirdKeyword = normalize(activeSearch.third);
    return (query.data ?? []).filter((item) => {
      const isLiquid = LIQUID_CATEGORIES.has(item.item_categories?.name ?? '');
      if ((mode === 'liquid') !== isLiquid) return false;
      if (itemNameKeyword && !normalize(item.item_name).includes(itemNameKeyword)) return false;
      const secondValue = mode === 'liquid' ? item.liquid_flavor : item.item_code;
      const thirdValue = mode === 'liquid' ? item.liquid_type : item.item_categories?.name;
      if (secondKeyword && !normalize(secondValue).includes(secondKeyword)) return false;
      if (thirdKeyword && !normalize(thirdValue).includes(thirdKeyword)) return false;
      return true;
    });
  }, [activeSearch, mode, query.data]);

  const updateSearch = (field: keyof SearchValues, value: string) => {
    setSearchValues((current) => ({ ...current, [mode]: { ...current[mode], [field]: value } }));
  };
  const hasSearchValue = Object.values(activeSearch).some(Boolean);

  if (query.isPending) return <Loading size="lg" text="상품 정보를 불러오는 중..." />;
  if (query.isError) return <p className="p-8 text-center text-rose-600">상품 정보를 불러오지 못했습니다.</p>;

  return (
    <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-xl border border-brand-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-3 lg:w-[220px] lg:shrink-0">
            <p className="mb-2 text-xs font-semibold text-gray-500">검색 구분</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-200/70 p-1">
              <button type="button" onClick={() => setMode('liquid')} className={`whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-semibold transition ${mode === 'liquid' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:bg-white/50 hover:text-gray-700'}`}>액상 검색</button>
              <button type="button" onClick={() => setMode('other')} className={`whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-semibold transition ${mode === 'other' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:bg-white/50 hover:text-gray-700'}`}>나머지 검색</button>
            </div>
          </div>

          <div className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-3 lg:w-fit">
            <div className="grid gap-3 sm:grid-cols-[repeat(3,240px)]">
              {([
                { field: 'itemName', label: '품목명', placeholder: '품목명 입력' },
                { field: 'second', label: mode === 'liquid' ? '액상 맛' : '품목 코드', placeholder: mode === 'liquid' ? '액상 맛 입력' : '품목 코드 입력' },
                { field: 'third', label: mode === 'liquid' ? '액상 종류' : '품목 종류', placeholder: mode === 'liquid' ? '액상 종류 입력' : '품목 종류 입력' },
              ] as const).map(({ field, label, placeholder }, index) => (
                <label
                  key={`${mode}-${field}`}
                  className={`block w-full ${index > 0 ? 'sm:border-l sm:border-gray-200 sm:pl-3' : ''}`}
                >
                  <span className="mb-2 block text-xs font-semibold text-gray-500">{label}</span>
                  <span className="relative block">
                    <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" /></svg>
                    <input value={activeSearch[field]} onChange={(event) => updateSearch(field, event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" placeholder={placeholder} />
                    {activeSearch[field] && <button type="button" onClick={() => updateSearch(field, '')} aria-label={`${label} 검색어 지우기`} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300">×</button>}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-2 flex min-h-6 items-center justify-end gap-2">
              <span className="text-xs font-medium text-brand-600">검색 결과 {items.length.toLocaleString()}개</span>
              {hasSearchValue && <button type="button" onClick={() => setSearchValues((current) => ({ ...current, [mode]: { itemName: '', second: '', third: '' } }))} className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200">검색 초기화</button>}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="bg-brand-50 text-xs font-semibold text-brand-700">
              <tr>
                <th className={headerCellClass}>품목 종류</th>
                <th className={headerCellClass}>품목 코드</th>
                <th className={headerCellClass}>품목 명</th>
                {mode === 'other' && <th className={`${headerCellClass} text-right`}>매출단가</th>}
                <th className={headerCellClass}>비고</th>
                {mode === 'liquid' && <>
                  <th className={headerCellClass}>액상 종류</th>
                  <th className={headerCellClass}>액상 맛</th>
                  <th className={headerCellClass}>시연대 위치</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {items.length ? items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-brand-50/40">
                  <td className={`${bodyCellClass} whitespace-nowrap`}>{item.item_categories?.name ?? '-'}</td>
                  <td className={`${bodyCellClass} whitespace-nowrap font-mono text-gray-600`}>{item.item_code}</td>
                  <td className={`${bodyCellClass} whitespace-nowrap font-semibold text-gray-900`}>{item.item_name}</td>
                  {mode === 'other' && <td className={`${bodyCellClass} whitespace-nowrap text-right font-medium`}>{item.selling_price != null ? `${item.selling_price.toLocaleString()}원` : '-'}</td>}
                  <td className={`${bodyCellClass} max-w-72 text-gray-600`}><p className="line-clamp-2" title={item.note ?? ''}>{item.note || '-'}</p></td>
                  {mode === 'liquid' && <>
                    <td className={`${bodyCellClass} whitespace-nowrap`}>{item.liquid_type || '-'}</td>
                    <td className={`${bodyCellClass} whitespace-nowrap`}>{item.liquid_flavor || '-'}</td>
                    <td className={`${bodyCellClass} whitespace-nowrap`}>{item.locations.length ? item.locations.join(', ') : '미배치'}</td>
                  </>}
                </tr>
              )) : (
                <tr><td colSpan={mode === 'liquid' ? 7 : 5} className={`${bodyCellClass} py-14 text-center text-gray-400`}>검색 결과가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
