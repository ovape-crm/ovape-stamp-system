'use client';

import { useRef } from 'react';

interface DateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  onChangeStart: (date: string | null) => void;
  onChangeEnd: (date: string | null) => void;
  onReset: () => void;
}

const formatDisplayDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return `${y}.${m}.${d}`;
};

const DateInput = ({
  value,
  onChange,
  placeholder,
  min,
}: {
  value: string | null;
  onChange: (date: string | null) => void;
  placeholder: string;
  min?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="relative cursor-pointer"
      onClick={() => inputRef.current?.showPicker?.()}
    >
      {/* 실제 input - 투명하게 위에 깔아서 네이티브 picker만 동작 */}
      <input
        ref={inputRef}
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        min={min}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        tabIndex={-1}
      />
      {/* 보이는 UI */}
      <div className="px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-brand-200 rounded-lg bg-white select-none">
        {value ? (
          <span className="text-gray-900">{formatDisplayDate(value)}</span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
      </div>
    </div>
  );
};

const DateRangePicker = ({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
  onReset,
}: DateRangePickerProps) => {
  const hasFilter = startDate || endDate;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <DateInput
        value={startDate}
        onChange={onChangeStart}
        placeholder="시작일"
      />
      <span className="text-xs sm:text-sm text-gray-400">~</span>
      <DateInput
        value={endDate}
        onChange={onChangeEnd}
        placeholder="종료일"
        min={startDate ?? undefined}
      />
      {hasFilter && (
        <button
          type="button"
          onClick={onReset}
          className="px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-lg font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 transition-colors cursor-pointer whitespace-nowrap shadow-sm"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default DateRangePicker;
