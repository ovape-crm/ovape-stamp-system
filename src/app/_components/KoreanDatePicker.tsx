'use client';

import { useEffect, useRef, useState } from 'react';

export const formatKoreanDate = (date: string) => {
  if (!date) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${date}T00:00:00`));
};

const KoreanDatePicker = ({
  value,
  onChange,
  selectedLabel = '선택한 날짜',
}: {
  value: string;
  onChange: (value: string) => void;
  selectedLabel?: string;
}) => {
  const getMonthFromValue = () => {
    const date = value ? new Date(`${value}T00:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  };

  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [visibleMonth, setVisibleMonth] = useState(getMonthFromValue);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectDate = (day: number) => {
    const selectedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(selectedDate);
    setIsOpen(false);
  };

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setVisibleMonth(getMonthFromValue());
          setIsOpen((previous) => !previous);
        }}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm outline-none hover:border-brand-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>
          {value ? formatKoreanDate(value) : '날짜를 선택하세요'}
        </span>
        <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[300px] rounded-xl border border-brand-100 bg-white p-3 shadow-xl">
          <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-center">
            <p className="text-xs text-brand-500">{selectedLabel}</p>
            <p className="mt-0.5 text-sm font-semibold text-brand-700">
              {value ? formatKoreanDate(value) : '날짜를 선택하세요'}
            </p>
          </div>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setVisibleMonth(new Date(year, month - 1, 1))} className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100" aria-label="이전 달">‹</button>
            <strong className="text-sm text-gray-800">{year}년 {month + 1}월</strong>
            <button type="button" onClick={() => setVisibleMonth(new Date(year, month + 1, 1))} className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100" aria-label="다음 달">›</button>
          </div>
          <div className="grid grid-cols-7 text-center">
            {weekdays.map((weekday, index) => (
              <span key={weekday} className={`py-1 text-[11px] font-medium ${index === 0 ? 'text-rose-500' : index === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                {weekday}
              </span>
            ))}
            {calendarCells.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} />;
              const dateValue = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = dateValue === value;
              const weekdayIndex = index % 7;
              return (
                <button key={dateValue} type="button" onClick={() => selectDate(day)} className={`mx-auto my-0.5 flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors ${isSelected ? 'bg-brand-500 font-semibold text-white' : weekdayIndex === 0 ? 'text-rose-500 hover:bg-rose-50' : weekdayIndex === 6 ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-700 hover:bg-brand-50'}`}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default KoreanDatePicker;
