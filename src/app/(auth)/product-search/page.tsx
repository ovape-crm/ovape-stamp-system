"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Loading from "@/app/_components/Loading";
import { useUser } from "@/app/_contexts/UserContext";
import { getProductSearchItems } from "@/app/_domains/_item/_services/productSearchService";
import {
  getLiquidSearchCategoryIds,
  liquidCategorySettingKey,
} from "@/app/_domains/_item/_services/productSearchCategoryService";
import LiquidCategorySettingsModal from "./_components/LiquidCategorySettingsModal";

type SearchMode = "liquid" | "other";
type UsageFilter = "all" | "used" | "unused";
type SearchValues = { itemName: string; second: string; third: string };

const LIQUID_CATEGORIES = new Set([
  "입호흡액상-기본",
  "입호흡액상-예약",
  "입호흡액상-이벤트",
  "폐호흡액상-기본",
  "폐호흡액상-이벤트",
  "폐호흡액상-예약",
]);

const headerCellClass = "border border-brand-200 px-4 py-3 text-left";
const bodyCellClass = "border border-gray-200 px-4 py-3 align-middle";

type ProductColumnKey =
  | "category"
  | "code"
  | "name"
  | "stock"
  | "price"
  | "note"
  | "liquidType"
  | "flavor"
  | "location";

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
  align = "left",
}: {
  label: string;
  width: number;
  onResize: (width: number) => void;
  align?: "left" | "right";
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  return (
    <th
      className={`${headerCellClass} relative select-none ${align === "right" ? "text-right" : ""}`}
      style={{ width }}
    >
      {label}
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
            Math.max(70, drag.current.width + event.clientX - drag.current.x),
          );
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        className="absolute -right-1 top-0 z-10 h-full w-3 cursor-col-resize touch-none after:absolute after:bottom-2 after:left-1/2 after:top-2 after:w-px after:-translate-x-1/2 after:bg-brand-200 hover:after:w-0.5 hover:after:bg-brand-500"
      />
    </th>
  );
}

export default function ProductSearchPage() {
  const { isAdmin } = useUser();
  const [mode, setMode] = useState<SearchMode>("liquid");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("used");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<
    Record<ProductColumnKey, number>
  >(() => {
    if (typeof window === "undefined") return defaultColumnWidths;
    try {
      const saved = window.localStorage.getItem("product-search-column-widths");
      return saved
        ? { ...defaultColumnWidths, ...JSON.parse(saved) }
        : defaultColumnWidths;
    } catch {
      return defaultColumnWidths;
    }
  });
  const [searchValues, setSearchValues] = useState<
    Record<SearchMode, SearchValues>
  >({
    liquid: { itemName: "", second: "", third: "" },
    other: { itemName: "", second: "", third: "" },
  });
  const query = useQuery({
    queryKey: ["product-search"],
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

  const items = useMemo(() => {
    const normalize = (value: string | null | undefined) =>
      value?.trim().toLocaleLowerCase("ko-KR") ?? "";
    const itemNameKeyword = normalize(activeSearch.itemName);
    const secondKeyword = normalize(activeSearch.second);
    const thirdKeyword = normalize(activeSearch.third);
    return (query.data ?? []).filter((item) => {
      const isLiquid = liquidCategoryQuery.isError
        ? LIQUID_CATEGORIES.has(item.item_categories?.name ?? "")
        : liquidCategoryIds.has(
            item.category_id == null ? "" : String(item.category_id),
          );
      if ((mode === "liquid") !== isLiquid) return false;
      if (usageFilter === "used" && !item.is_use) return false;
      if (usageFilter === "unused" && item.is_use) return false;
      if (
        itemNameKeyword &&
        !normalize(item.item_name).includes(itemNameKeyword)
      )
        return false;
      const secondValue =
        mode === "liquid" ? item.liquid_flavor : item.item_code;
      const thirdValue =
        mode === "liquid" ? item.liquid_type : item.item_categories?.name;
      if (secondKeyword && !normalize(secondValue).includes(secondKeyword))
        return false;
      if (thirdKeyword && !normalize(thirdValue).includes(thirdKeyword))
        return false;
      return true;
    });
  }, [
    activeSearch,
    liquidCategoryIds,
    liquidCategoryQuery.isError,
    mode,
    query.data,
    usageFilter,
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
      const next = { ...current, [key]: Math.round(width) };
      window.localStorage.setItem(
        "product-search-column-widths",
        JSON.stringify(next),
      );
      return next;
    });
  };
  const visibleColumnKeys: ProductColumnKey[] =
    mode === "liquid"
      ? [
          "category",
          "code",
          "name",
          "stock",
          "note",
          "liquidType",
          "flavor",
          "location",
        ]
      : ["category", "code", "name", "stock", "price", "note"];
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
    <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-xl border border-brand-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-3 lg:w-[220px] lg:shrink-0">
            <p className="mb-2 text-xs font-semibold text-gray-500">
              검색 구분
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-200/70 p-1">
              <button
                type="button"
                onClick={() => setMode("liquid")}
                className={`whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-semibold transition ${mode === "liquid" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:bg-white/50 hover:text-gray-700"}`}
              >
                액상 검색
              </button>
              <button
                type="button"
                onClick={() => setMode("other")}
                className={`whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-semibold transition ${mode === "other" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:bg-white/50 hover:text-gray-700"}`}
              >
                나머지 검색
              </button>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="mt-2 flex h-7 w-full items-center justify-center rounded-md border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50 active:bg-brand-100"
              >
                액상 검색 기준
              </button>
            )}
          </div>

          <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-3 lg:w-[250px] lg:shrink-0">
            <p className="mb-2 text-xs font-semibold text-gray-500">
              사용 구분
            </p>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-200/70 p-1">
              {(
                [
                  ["all", "전체"],
                  ["used", "사용"],
                  ["unused", "미사용"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setUsageFilter(value)}
                  className={`min-h-10 rounded-md px-2 text-xs font-semibold transition ${usageFilter === value ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-3 lg:w-fit">
            <div className="grid gap-3 sm:grid-cols-[repeat(3,240px)]">
              {(
                [
                  {
                    field: "itemName",
                    label: "품목명",
                    placeholder: "품목명 입력",
                  },
                  {
                    field: "second",
                    label: mode === "liquid" ? "액상 맛" : "품목 코드",
                    placeholder:
                      mode === "liquid" ? "액상 맛 입력" : "품목 코드 입력",
                  },
                  {
                    field: "third",
                    label: mode === "liquid" ? "액상 종류" : "품목 종류",
                    placeholder:
                      mode === "liquid" ? "액상 종류 입력" : "품목 종류 입력",
                  },
                ] as const
              ).map(({ field, label, placeholder }, index) => (
                <label
                  key={`${mode}-${field}`}
                  className={`block w-full ${index > 0 ? "sm:border-l sm:border-gray-200 sm:pl-3" : ""}`}
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
                        onClick={() => updateSearch(field, "")}
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
            <div className="mt-2 flex min-h-6 items-center justify-end gap-2">
              <span className="text-xs font-medium text-brand-600">
                검색 결과 {items.length.toLocaleString()}개
              </span>
              {hasSearchValue && (
                <button
                  type="button"
                  onClick={() =>
                    setSearchValues((current) => ({
                      ...current,
                      [mode]: { itemName: "", second: "", third: "" },
                    }))
                  }
                  className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                >
                  검색 초기화
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {isAdmin && settingsOpen && (
        <LiquidCategorySettingsModal
          initialCategoryIds={liquidCategoryQuery.data ?? []}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table
            className="table-fixed border-collapse text-sm"
            style={{ width: Math.max(tableWidth, 900), minWidth: "100%" }}
          >
            <thead className="bg-brand-50 text-xs font-semibold text-brand-700">
              <tr>
                <ResizableHeader
                  label="품목 종류"
                  width={columnWidths.category}
                  onResize={(width) => resizeColumn("category", width)}
                />
                <ResizableHeader
                  label="품목 코드"
                  width={columnWidths.code}
                  onResize={(width) => resizeColumn("code", width)}
                />
                <ResizableHeader
                  label="품목 명"
                  width={columnWidths.name}
                  onResize={(width) => resizeColumn("name", width)}
                />
                <ResizableHeader
                  label="현재 재고"
                  width={columnWidths.stock}
                  onResize={(width) => resizeColumn("stock", width)}
                  align="right"
                />
                {mode === "other" && (
                  <ResizableHeader
                    label="매출단가"
                    width={columnWidths.price}
                    onResize={(width) => resizeColumn("price", width)}
                    align="right"
                  />
                )}
                <ResizableHeader
                  label="비고"
                  width={columnWidths.note}
                  onResize={(width) => resizeColumn("note", width)}
                />
                {mode === "liquid" && (
                  <>
                    <ResizableHeader
                      label="액상 종류"
                      width={columnWidths.liquidType}
                      onResize={(width) => resizeColumn("liquidType", width)}
                    />
                    <ResizableHeader
                      label="액상 맛"
                      width={columnWidths.flavor}
                      onResize={(width) => resizeColumn("flavor", width)}
                    />
                    <ResizableHeader
                      label="시연대 위치"
                      width={columnWidths.location}
                      onResize={(width) => resizeColumn("location", width)}
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
                      {item.item_categories?.name ?? "-"}
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
                        ? "-"
                        : item.current_quantity === 0
                          ? "품절"
                          : `${item.current_quantity.toLocaleString()}개`}
                    </td>
                    {mode === "other" && (
                      <td
                        className={`${bodyCellClass} whitespace-nowrap text-right font-medium`}
                      >
                        {item.selling_price != null
                          ? `${item.selling_price.toLocaleString()}원`
                          : "-"}
                      </td>
                    )}
                    <td className={`${bodyCellClass} max-w-72 text-gray-600`}>
                      <p className="line-clamp-2" title={item.note ?? ""}>
                        {item.note || "-"}
                      </p>
                    </td>
                    {mode === "liquid" && (
                      <>
                        <td className={`${bodyCellClass} break-words`}>
                          {item.liquid_type || "-"}
                        </td>
                        <td className={`${bodyCellClass} break-words`}>
                          {item.liquid_flavor || "-"}
                        </td>
                        <td className={`${bodyCellClass} break-words`}>
                          {item.locations.length
                            ? item.locations.join(", ")
                            : "미배치"}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={mode === "liquid" ? 8 : 6}
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
    </main>
  );
}
