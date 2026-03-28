'use client';

import { useEffect } from 'react';

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
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

  const parts = value.split(/(<red>.*?<\/red>|<bold>.*?<\/bold>|<line>.*?<\/line>)/g);
  if (parts.length === 1) return value;

  return (
    <>
      {parts.map((part, i) => {
        const redMatch = part.match(/^<red>(.*)<\/red>$/);
        if (redMatch) return <span key={i} className="text-red-500">{redMatch[1]}</span>;
        const boldMatch = part.match(/^<bold>(.*)<\/bold>$/);
        if (boldMatch) return <span key={i} className="font-extrabold">{boldMatch[1]}</span>;
        const lineMatch = part.match(/^<line>(.*)<\/line>$/);
        if (lineMatch) return <span key={i} className="line-through">{lineMatch[1]}</span>;
        return part || null;
      })}
    </>
  );
}
import { createPortal } from 'react-dom';
import { ComparisonColumnType, ComparisonDeviceType } from '@/app/_types/comparison.types';

type ValueMap = Record<string, string>;
type FilledSlot = { device: ComparisonDeviceType; valueMap: ValueMap };

interface ComparisonExpandViewProps {
  columns: ComparisonColumnType[];
  filledSlots: FilledSlot[];
  onClose: () => void;
}

export default function ComparisonExpandView({
  columns,
  filledSlots,
  onClose,
}: ComparisonExpandViewProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[4000] flex items-center justify-center">
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 패널 */}
      <div className="relative z-10 w-full max-w-5xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 워터마크 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
          <img
            src="/logo.PNG"
            alt=""
            className="w-64 opacity-[0.06] select-none mix-blend-multiply"
            draggable={false}
          />
        </div>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-800">기기 비교</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors text-2xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 테이블 */}
        <div className="overflow-auto flex-1 relative">
          <table className="min-w-full text-sm border-separate border-spacing-0 relative z-10">
            <thead>
              <tr className="bg-brand-50">
                <th className="sticky left-0 z-10 bg-brand-50 px-3 py-3 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-r border-brand-100 min-w-[80px] w-[80px]">
                  컬럼
                </th>
                {filledSlots.map((slot, i) => (
                  <th
                    key={slot.device.id}
                    className="px-5 py-3 text-left font-semibold text-brand-700 whitespace-nowrap border-b border-r border-brand-100 min-w-[160px]"
                  >
                    기기 {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((col, colIdx) => (
                <tr
                  key={col.id}
                  className={colIdx % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}
                >
                  <td className={`sticky left-0 z-10 px-3 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap border-b border-r border-brand-50 w-[80px] ${colIdx % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
                    {col.name}
                  </td>
                  {filledSlots.map((slot) => (
                    <td
                      key={slot.device.id}
                      className="px-5 py-3.5 text-gray-800 font-medium whitespace-nowrap border-b border-r border-brand-50"
                    >
                      {slot.valueMap[col.id] ? (
                        renderValue(slot.valueMap[col.id])
                      ) : (
                        <span className="text-gray-300 font-normal">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
}
