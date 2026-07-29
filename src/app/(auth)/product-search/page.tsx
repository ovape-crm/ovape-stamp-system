'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dropdown, DropdownOption } from '@/app/_components/Dropdown';
import Loading from '@/app/_components/Loading';
import { useUser } from '@/app/_contexts/UserContext';
import { getProductSearchItems } from '@/app/_domains/_item/_services/productSearchService';
import {
  getLiquidSearchCategoryIds,
  liquidCategorySettingKey,
} from '@/app/_domains/_item/_services/productSearchCategoryService';
import LiquidCategorySettingsModal from './_components/LiquidCategorySettingsModal';

type SearchMode = 'liquid' | 'other';
type UsageFilter = 'all' | 'used' | 'unused';
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

type ProductColumnKey =
  | 'category'
  | 'code'
  | 'name'
  | 'stock'
  | 'price'
  | 'note'
  | 'liquidType'
  | 'flavor'
  | 'location';

const defaultColumnWidths: Record<ProductColumnKey, number> = {
  category: 150,
  code: 130,
  name: 210,
  stock: 110,
  price: 110,
  note: 300,
  liquidType: 120,
  flavor: 160,
  location: 120,
};

function ResizableHeader({
  label,
  width,
  onResize,
  editable,
  align = 'left',
}: {
  label: string;
  width: number;
  onResize: (width: number) => void;
  editable: boolean;
  align?: 'left' | 'right';
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  return (
    <th
      className={`${headerCellClass} relative select-none ${align === 'right' ? 'text-right' : ''}`}
      style={{ width }}
    >
      {label}
      {editable && (
      <button
        type="button"
        aria-label={`${label} 열 너비 조절`}
        title="좌우로 드래그해 열 너비 조절"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          onResize(
            Math.min(
              360,
              Math.max(
                70,
                drag.current.width + event.clientX - drag.current.x,
              ),
            ),
          );
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        className="group absolute -right-1.5 top-0 z-10 flex h-full w-5 cursor-col-resize touch-none items-center justify-center pr-1"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4 text-brand-200 transition-colors group-hover:text-brand-500"
        >
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>
      )}
    </th>
  );
}

export default function ProductSearchPage() {
  const { isAdmin } = useUser();
  const [mode, setMode] = useState<SearchMode>('liquid');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('used');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnEditing, setColumnEditing] = useState(false);
  const [columnWidthSnapshot, setColumnWidthSnapshot] = useState<
    Record<ProductColumnKey, number> | null
  >(null);
  const [columnWidths, setColumnWidths] = useState<
    Record<ProductColumnKey, number>
  >(() => {
    if (typeof window === 'undefined') return defaultColumnWidths;
    try {
      const saved = window.localStorage.getItem('product-search-column-widths');
      const widths = saved
        ? { ...defaultColumnWidths, ...JSON.parse(saved) }
        : defaultColumnWidths;
      return Object.fromEntries(
        Object.entries(widths).map(([key, value]) => [
          key,
          Math.min(360, Math.max(70, Number(value) || defaultColumnWidths[key as ProductColumnKey])),
        ]),
      ) as Record<ProductColumnKey, number>;
    } catch {
      return defaultColumnWidths;
    }
  });
  const [searchValues, setSearchValues] = useState<
    Record<SearchMode, SearchValues>
  >({
    liquid: { itemName: '', second: '', third: '' },
    other: { itemName: '', second: '', third: '' },
  });
  const query = useQuery({
    queryKey: ['product-search'],
    queryFn: getProductSearchItems,
  });
  const liquidCategoryQuery = useQuery({
    queryKey: liquidCategorySettingKey,
    queryFn: getLiquidSearchCategoryIds,
    retry: false,
  });
  const activeSearch = searchValues[mode];
  const liquidCategoryIds = useMemo(
    () => new Set(liquidCategoryQuery.data ?? []),
    [liquidCategoryQuery.data],
  );

  const availableItems = useMemo(
    () =>
      (query.data ?? []).filter((item) => {
        const isLiquid = liquidCategoryQuery.isError
          ? LIQUID_CATEGORIES.has(item.item_categories?.name ?? '')
          : liquidCategoryIds.has(
              item.category_id == null ? '' : String(item.category_id),
            );
        if ((mode === 'liquid') !== isLiquid) return false;
        if (usageFilter === 'used' && !item.is_use) return false;
        if (usageFilter === 'unused' && item.is_use) return false;
        return true;
      }),
    [
      liquidCategoryIds,
      liquidCategoryQuery.isError,
      mode,
      query.data,
      usageFilter,
    ],
  );

  const items = useMemo(() => {
    const normalize = (value: string | null | undefined) =>
      value?.trim().toLocaleLowerCase('ko-KR') ?? '';
    const itemNameKeyword = normalize(activeSearch.itemName);
    const secondKeyword = normalize(activeSearch.second);
    const thirdKeyword = normalize(activeSearch.third);
    return availableItems.filter((item) => {
      if (
        itemNameKeyword &&
        !normalize(item.item_name).includes(itemNameKeyword)
      )
        return false;
      const secondValue =
        mode === 'liquid' ? item.liquid_flavor : item.item_code;
      const thirdValue =
        mode === 'liquid' ? item.liquid_type : item.item_categories?.name;
      if (secondKeyword && !normalize(secondValue).includes(secondKeyword))
        return false;
      if (thirdKeyword && !normalize(thirdValue).includes(thirdKeyword))
        return false;
      return true;
    });
  }, [
    activeSearch,
    availableItems,
    mode,
  ]);

  const updateSearch = (field: keyof SearchValues, value: string) => {
    setSearchValues((current) => ({
      ...current,
      [mode]: { ...current[mode], [field]: value },
    }));
  };
  const hasSearchValue = Object.values(activeSearch).some(Boolean);
  const resizeColumn = (key: ProductColumnKey, width: number) => {
    setColumnWidths((current) => {
      return { ...current, [key]: Math.round(width) };
    });
  };
  const startColumnEditing = () => {
    setColumnWidthSnapshot({ ...columnWidths });
    setColumnEditing(true);
  };
  const saveColumnWidths = () => {
    window.localStorage.setItem(
      'product-search-column-widths',
      JSON.stringify(columnWidths),
    );
    setColumnWidthSnapshot(null);
    setColumnEditing(false);
  };
  const cancelColumnEditing = () => {
    if (columnWidthSnapshot) setColumnWidths(columnWidthSnapshot);
    setColumnWidthSnapshot(null);
    setColumnEditing(false);
  };
  const visibleColumnKeys: ProductColumnKey[] =
    mode === 'liquid'
      ? [
          'category',
          'code',
          'name',
          'stock',
          'note',
          'liquidType',
          'flavor',
          'location',
        ]
      : ['category', 'code', 'name', 'stock', 'price', 'note'];
  const tableWidth = visibleColumnKeys.reduce(
    (sum, key) => sum + columnWidths[key],
    0,
  );

  if (query.isPending)
    return <Loading size="lg" text="상품 정보를 불러오는 중..." />;
  if (query.isError)
    return (
      <p className="p-8 text-center text-rose-600">
        상품 정보를 불러오지 못했습니다.
      </p>
    );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-4">
      <section className="rounded-xl border border-brand-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-3 lg:w-[220px] lg:shrink-0">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500">검색 구분</p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  title="액상 검색 기준 설정"
                  className="translate-y-[1px] cursor-pointer text-gray-400 transition-all hover:rotate-45 hover:text-gray-600"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 transition-transform"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
              )}
            </div>
            <div className="sm:hidden">
              <Dropdown controlledValue={mode}>
                <Dropdown.Trigger>
                  {mode === 'liquid' ? '액상' : '나머지'}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {(
                    [
                      { value: 'liquid', label: '액상' },
                      { value: 'other', label: '나머지' },
                    ] as const
                  ).map((option) => (
                    <Dropdown.Item
                      key={option.value}
                      option={option}
                      onSelect={(selected: DropdownOption) =>
                        setMode(selected.value as SearchMode)
                      }
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
            <div className="hidden flex-1 grid-cols-2 grid-rows-1 gap-1 rounded-lg bg-gray-200/70 p-1 sm:grid">
              <button
                type="button"
                onClick={() => setMode('liquid')}
                className={`flex items-center justify-center whitespace-nowrap rounded-md px-3 py-2.5 text-xs font-semibold transition ${mode === 'liquid' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:bg-white/50 hover:text-gray-700'}`}
              >
                액상
              </button>
              <button
                type="button"
                onClick={() => setMode('other')}
                className={`flex items-center justify-center whitespace-nowrap rounded-md px-3 py-2.5 text-xs font-semibold transition ${mode === 'other' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:bg-white/50 hover:text-gray-700'}`}
              >
                나머지
              </button>
            </div>
          </div>

          <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
            <p className="mb-1 text-xs font-semibold text-gray-600">
              사용 구분
            </p>
            <Dropdown controlledValue={usageFilter}>
              <Dropdown.Trigger compact>
                {
                  [
                    { value: 'all', label: '전체' },
                    { value: 'used', label: '사용' },
                    { value: 'unused', label: '미사용' },
                  ].find((option) => option.value === usageFilter)?.label
                }
              </Dropdown.Trigger>
              <Dropdown.Content compact>
              {(
                [
                  { value: 'all', label: '전체' },
                  { value: 'used', label: '사용' },
                  { value: 'unused', label: '미사용' },
                ] as const
              ).map((option) => (
                <Dropdown.Item
                  key={option.value}
                  option={option}
                  compact
                  onSelect={(selected: DropdownOption) =>
                    setUsageFilter(
                      selected.value as 'all' | 'used' | 'unused',
                    )
                  }
                />
              ))}
              </Dropdown.Content>
            </Dropdown>
          </div>

          <div className="h-px w-full bg-gray-200 lg:h-auto lg:w-px lg:self-stretch" />

          <div className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-3 lg:w-[740px] lg:shrink-0">
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    field: 'itemName',
                    label: '품목명',
                    placeholder: '품목명 입력',
                  },
                  {
                    field: 'second',
                    label: mode === 'liquid' ? '액상 맛' : '품목 코드',
                    placeholder:
                      mode === 'liquid' ? '액상 맛 입력' : '품목 코드 입력',
                  },
                  {
                    field: 'third',
                    label: mode === 'liquid' ? '액상 종류' : '품목 종류',
                    placeholder:
                      mode === 'liquid' ? '액상 종류 입력' : '품목 종류 입력',
                  },
                ] as const
              ).map(({ field, label, placeholder }, index) => (
                <label
                  key={`${mode}-${field}`}
                  className={`block w-full ${index > 0 ? 'sm:border-l sm:border-gray-200 sm:pl-3' : ''}`}
                >
                  <span className="mb-2 block text-xs font-semibold text-gray-500">
                    {label}
                  </span>
                  <span className="relative block">
                    <svg
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                      />
                    </svg>
                    <input
                      value={activeSearch[field]}
                      onChange={(event) =>
                        updateSearch(field, event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      placeholder={placeholder}
                    />
                    {activeSearch[field] && (
                      <button
                        type="button"
                        onClick={() => updateSearch(field, '')}
                        aria-label={`${label} 검색어 지우기`}
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300"
                      >
                        ×
                      </button>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {hasSearchValue && (
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSearchValues((current) => ({
                      ...current,
                      [mode]: { itemName: '', second: '', third: '' },
                    }))
                  }
                  className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                >
                  검색 초기화
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {isAdmin && settingsOpen && (
        <LiquidCategorySettingsModal
          initialCategoryIds={liquidCategoryQuery.data ?? []}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600 sm:text-sm">
            <span className="font-semibold text-brand-600">
              {items.length.toLocaleString()}
            </span>
            <span className="text-gray-400"> / </span>
            <span className="font-semibold text-gray-600">
              {availableItems.length.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {columnEditing && (
              <>
                <button
                  type="button"
                  onClick={saveColumnWidths}
                  className="min-h-9 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white shadow-sm hover:bg-brand-600"
                >
                  변경 값 저장
                </button>
                <button
                  type="button"
                  onClick={cancelColumnEditing}
                  className="min-h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50"
                >
                  취소
                </button>
              </>
            )}
            <button
              type="button"
              onClick={columnEditing ? undefined : startColumnEditing}
              aria-label="표 열 너비 변경"
              title={
                columnEditing
                  ? "열 너비 편집 중"
                  : "표 열 너비 변경"
              }
              className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-white transition ${
                columnEditing
                  ? "border-brand-300 text-brand-700 shadow-sm"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-700"
              }`}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Zm7.25-3.25c0-.48-.05-.95-.14-1.4l2.02-1.57-2-3.46-2.48 1a7.4 7.4 0 0 0-2.42-1.4L13.88 2.5h-4l-.35 2.67a7.4 7.4 0 0 0-2.42 1.4l-2.48-1-2 3.46 2.02 1.57a7.18 7.18 0 0 0 0 2.8l-2.02 1.57 2 3.46 2.48-1a7.4 7.4 0 0 0 2.42 1.4l.35 2.67h4l.35-2.67a7.4 7.4 0 0 0 2.42-1.4l2.48 1 2-3.46-2.02-1.57c.09-.45.14-.92.14-1.4Z"
                />
              </svg>
            </button>
          </div>
        </div>
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table
              className="table-fixed border-collapse text-sm"
              style={{ width: tableWidth, minWidth: tableWidth }}
            >
            <colgroup>
              {visibleColumnKeys.map((key) => (
                <col key={key} style={{ width: columnWidths[key] }} />
              ))}
            </colgroup>
            <thead className="bg-brand-50 text-xs font-semibold text-brand-700">
              <tr>
                <ResizableHeader
                  label="품목 종류"
                  width={columnWidths.category}
                  onResize={(width) => resizeColumn('category', width)}
                  editable={columnEditing}
                />
                <ResizableHeader
                  label="품목 코드"
                  width={columnWidths.code}
                  onResize={(width) => resizeColumn('code', width)}
                  editable={columnEditing}
                />
                <ResizableHeader
                  label="품목 명"
                  width={columnWidths.name}
                  onResize={(width) => resizeColumn('name', width)}
                  editable={columnEditing}
                />
                <ResizableHeader
                  label="현재 재고"
                  width={columnWidths.stock}
                  onResize={(width) => resizeColumn('stock', width)}
                  editable={columnEditing}
                  align="right"
                />
                {mode === 'other' && (
                  <ResizableHeader
                    label="매출단가"
                    width={columnWidths.price}
                    onResize={(width) => resizeColumn('price', width)}
                    editable={columnEditing}
                    align="right"
                  />
                )}
                <ResizableHeader
                  label="비고"
                  width={columnWidths.note}
                  onResize={(width) => resizeColumn('note', width)}
                  editable={columnEditing}
                />
                {mode === 'liquid' && (
                  <>
                    <ResizableHeader
                      label="액상 종류"
                      width={columnWidths.liquidType}
                      onResize={(width) => resizeColumn('liquidType', width)}
                      editable={columnEditing}
                    />
                    <ResizableHeader
                      label="액상 맛"
                      width={columnWidths.flavor}
                      onResize={(width) => resizeColumn('flavor', width)}
                      editable={columnEditing}
                    />
                    <ResizableHeader
                      label="시연대 위치"
                      width={columnWidths.location}
                      onResize={(width) => resizeColumn('location', width)}
                      editable={columnEditing}
                    />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-brand-50/40"
                  >
                    <td className={`${bodyCellClass} break-words`}>
                      {item.item_categories?.name ?? '-'}
                    </td>
                    <td
                      className={`${bodyCellClass} break-all font-mono text-gray-600`}
                    >
                      {item.item_code}
                    </td>
                    <td
                      className={`${bodyCellClass} break-words font-semibold text-gray-900`}
                    >
                      {item.item_name}
                    </td>
                    <td
                      className={`${bodyCellClass} text-right font-semibold text-gray-900`}
                    >
                      {item.current_quantity == null
                        ? '-'
                        : item.current_quantity === 0
                          ? '품절'
                          : `${item.current_quantity.toLocaleString()}개`}
                    </td>
                    {mode === 'other' && (
                      <td
                        className={`${bodyCellClass} whitespace-nowrap text-right font-medium`}
                      >
                        {item.selling_price != null
                          ? `${item.selling_price.toLocaleString()}원`
                          : '-'}
                      </td>
                    )}
                    <td className={`${bodyCellClass} max-w-72 text-gray-600`}>
                      <p className="line-clamp-2" title={item.note ?? ''}>
                        {item.note || '-'}
                      </p>
                    </td>
                    {mode === 'liquid' && (
                      <>
                        <td className={`${bodyCellClass} break-words`}>
                          {item.liquid_type || '-'}
                        </td>
                        <td className={`${bodyCellClass} break-words`}>
                          {item.liquid_flavor || '-'}
                        </td>
                        <td className={`${bodyCellClass} break-words`}>
                          {item.locations.length
                            ? item.locations.join(', ')
                            : '미배치'}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={mode === 'liquid' ? 8 : 6}
                    className={`${bodyCellClass} py-14 text-center text-gray-400`}
                  >
                    검색 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
