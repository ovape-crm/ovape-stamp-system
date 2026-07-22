"use client";

import { ComparisonColumnType } from "@/app/_domains/_comparison/_types/comparison.types";

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function renderValue(value: string) {
  if (isUrl(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-500 underline underline-offset-2 hover:text-brand-700 break-all"
      >
        {value}
      </a>
    );
  }

  const parts = value.split(
    /(<red>.*?<\/red>|<bold>.*?<\/bold>|<line>.*?<\/line>|<link url="[^"]*">.*?<\/link>)/g,
  );
  if (parts.length === 1) return value;

  return (
    <>
      {parts.map((part, i) => {
        const redMatch = part.match(/^<red>(.*)<\/red>$/);
        if (redMatch)
          return (
            <span key={i} className="text-red-500">
              {redMatch[1]}
            </span>
          );
        const boldMatch = part.match(/^<bold>(.*)<\/bold>$/);
        if (boldMatch)
          return (
            <span key={i} className="font-extrabold">
              {boldMatch[1]}
            </span>
          );
        const lineMatch = part.match(/^<line>(.*)<\/line>$/);
        if (lineMatch)
          return (
            <span key={i} className="line-through">
              {lineMatch[1]}
            </span>
          );
        const linkMatch = part.match(/^<link url="([^"]*)">(.*)<\/link>$/);
        if (linkMatch)
          return (
            <a
              key={i}
              href={linkMatch[1]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline underline-offset-2 hover:text-blue-700"
            >
              {linkMatch[2]}
            </a>
          );
        return part || null;
      })}
    </>
  );
}

type ValueMap = Record<string, string>;

interface EmptySlotProps {
  onAdd: () => void;
}

interface FilledSlotProps {
  columns: ComparisonColumnType[];
  valueMap: ValueMap;
  onRemove: () => void;
}

export function EmptySlot({ onAdd }: EmptySlotProps) {
  return (
    <div
      className="flex-1 min-w-[220px] flex flex-col items-center justify-center border-2 border-dashed border-brand-200 rounded-xl p-8 cursor-pointer hover:bg-brand-50/40 hover:border-brand-400 transition-colors"
      onClick={onAdd}
    >
      <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center mb-3">
        <span className="text-2xl text-brand-500 leading-none">+</span>
      </div>
      <p className="text-sm text-brand-500 font-medium">기기 추가</p>
    </div>
  );
}

export function FilledSlot({ columns, valueMap, onRemove }: FilledSlotProps) {
  return (
    <div className="flex-1 min-w-[220px] flex flex-col border border-brand-100 rounded-xl shadow-sm bg-white overflow-hidden">
      {/* 카드 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-brand-50 border-b border-brand-100">
        <span className="text-xs text-brand-400 font-medium tracking-wide uppercase">
          기기
        </span>
        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-rose-500 transition-colors text-lg leading-none"
          aria-label="기기 제거"
        >
          ×
        </button>
      </div>

      {/* 컬럼-값 목록 */}
      <div className="flex flex-col divide-y divide-brand-50 flex-1 overflow-y-auto">
        {columns.map((col) => (
          <div key={col.id} className="flex flex-col px-4 py-3 gap-0.5">
            <span className="text-xs text-gray-400 font-medium">
              {col.name}
            </span>
            <span className="text-sm text-gray-800 break-words">
              {valueMap[col.id] ? (
                renderValue(valueMap[col.id])
              ) : (
                <span className="text-gray-300 font-normal">-</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
