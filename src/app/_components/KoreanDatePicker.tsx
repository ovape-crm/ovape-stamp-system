"use client";

import { useEffect, useRef, useState } from "react";
import { Dropdown, type DropdownOption } from "@/app/_components/Dropdown";

const parseDateValue = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatKoreanDate = (date: string) => {
  const parsedDate = parseDateValue(date);
  if (!parsedDate) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(parsedDate);
};

const toDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const KoreanDatePicker = ({
  value,
  onChange,
  placement = "bottom",
  align = "right",
  floating = false,
}: {
  value: string;
  onChange: (value: string) => void;
  selectedLabel?: string;
  placement?: "top" | "bottom";
  align?: "left" | "right";
  floating?: boolean;
}) => {
  const getMonthFromValue = () => {
    const date = parseDateValue(value) ?? new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  };

  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [floatingPosition, setFloatingPosition] = useState({ top: 0, left: 0 });
  const [visibleMonth, setVisibleMonth] = useState(getMonthFromValue);
  const formattedValue = formatKoreanDate(value);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, index) => ({
    value: currentYear - 15 + index,
    label: `${currentYear - 15 + index}년`,
  }));
  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: index,
    label: `${index + 1}월`,
  }));
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (
        !pickerRef.current?.contains(target) &&
        !target.closest('[role="listbox"]')
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectDate = (day: number) => {
    const selectedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(selectedDate);
    setIsOpen(false);
  };

  return (
    <div ref={pickerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setVisibleMonth(getMonthFromValue());
          if (floating && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setFloatingPosition({
              top: placement === "top" ? rect.top - 4 : rect.bottom + 4,
              left: Math.max(
                8,
                Math.min(
                  window.innerWidth - 308,
                  align === "left" ? rect.left : rect.right - 300,
                ),
              ),
            });
          }
          setIsOpen((previous) => !previous);
        }}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm outline-none hover:border-brand-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <span className={formattedValue ? "text-gray-800" : "text-gray-400"}>
          {formattedValue || "날짜를 선택하세요"}
        </span>
        <svg
          className="h-4 w-4 shrink-0 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          style={
            floating
              ? {
                  top: floatingPosition.top,
                  left: floatingPosition.left,
                  transform:
                    placement === "top" ? "translateY(-100%)" : undefined,
                }
              : undefined
          }
          className={`${floating ? "fixed z-[2100]" : `absolute z-40 ${align === "left" ? "left-0" : "right-0"} ${placement === "top" ? "bottom-full mb-1" : "top-full mt-1"}`} w-[300px] rounded-xl border border-brand-100 bg-white p-3 shadow-xl`}
        >
          <div className="mb-2 grid grid-cols-[32px_minmax(0,1fr)_minmax(0,0.75fr)_32px] items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
              className="flex h-8 items-center justify-center text-xl font-bold leading-none text-brand-600 transition-colors hover:text-brand-700 active:text-brand-800"
              aria-label="이전 달"
            >
              ‹
            </button>
            <Dropdown controlledValue={year}>
              <Dropdown.Trigger compact>{year}년</Dropdown.Trigger>
              <Dropdown.Content compact neutral maxHeightClass="max-h-52">
                {yearOptions.map((option) => (
                  <Dropdown.Item
                    key={option.value}
                    option={option}
                    compact
                    neutral
                    onSelect={(selected: DropdownOption) =>
                      setVisibleMonth(
                        new Date(Number(selected.value), month, 1),
                      )
                    }
                  />
                ))}
              </Dropdown.Content>
            </Dropdown>
            <Dropdown controlledValue={month}>
              <Dropdown.Trigger compact>{month + 1}월</Dropdown.Trigger>
              <Dropdown.Content compact neutral maxHeightClass="max-h-52">
                {monthOptions.map((option) => (
                  <Dropdown.Item
                    key={option.value}
                    option={option}
                    compact
                    neutral
                    onSelect={(selected: DropdownOption) =>
                      setVisibleMonth(new Date(year, Number(selected.value), 1))
                    }
                  />
                ))}
              </Dropdown.Content>
            </Dropdown>
            <button
              type="button"
              onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
              className="flex h-8 items-center justify-center text-xl font-bold leading-none text-brand-600 transition-colors hover:text-brand-700 active:text-brand-800"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 text-center">
            {weekdays.map((weekday, index) => (
              <span
                key={weekday}
                className={`py-1 text-[11px] font-medium ${index === 0 ? "text-rose-500" : index === 6 ? "text-blue-500" : "text-gray-500"}`}
              >
                {weekday}
              </span>
            ))}
            {calendarCells.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} />;
              const dateValue = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = dateValue === value;
              const now = new Date();
              const todayValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
              const isToday = dateValue === todayValue;
              const weekdayIndex = index % 7;
              return (
                <button
                  key={dateValue}
                  type="button"
                  aria-label={`${day}일${isToday ? " 오늘" : ""}`}
                  onClick={() => selectDate(day)}
                  className={`relative mx-auto my-0.5 flex h-10 w-9 flex-col items-center justify-center rounded-lg text-xs leading-none transition-colors ${isSelected ? "bg-brand-500 font-semibold text-white" : isToday ? "border-2 border-brand-400 bg-brand-50 font-bold text-brand-700" : weekdayIndex === 0 ? "text-rose-500 hover:bg-rose-50" : weekdayIndex === 6 ? "text-blue-500 hover:bg-blue-50" : "text-gray-700 hover:bg-brand-50"}`}
                >
                  {day}
                  {isToday && (
                    <span
                      className={`mt-1 block text-[8px] font-bold leading-none ${isSelected ? "text-white/90" : "text-brand-600"}`}
                    >
                      오늘
                    </span>
                  )}
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

export const KoreanDateRangePicker = ({
  startDate,
  endDate,
  onApply,
  iconOnly = false,
}: {
  startDate: string;
  endDate: string;
  onApply: (startDate: string, endDate: string) => void;
  iconOnly?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const pickerRef = useRef<HTMLDivElement>(null);
  const compactDate = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    return `${date.getMonth() + 1}.${date.getDate()}`;
  };
  const compactSelection = startDate
    ? endDate
      ? `${compactDate(startDate)}~${compactDate(endDate)}`
      : compactDate(startDate)
    : "";
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [isOpen]);

  const openPicker = () => {
    setDraftStart(startDate);
    setDraftEnd(endDate);
    const base = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setIsOpen((current) => !current);
  };

  const selectDay = (day: number) => {
    const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!draftStart || draftEnd) {
      setDraftStart(value);
      setDraftEnd("");
    } else if (value < draftStart) {
      setDraftStart(value);
      setDraftEnd(draftStart);
    } else {
      setDraftEnd(value);
    }
  };

  const selectPreset = (preset: "today" | "yesterday" | "week" | "month") => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end);
    if (preset === "yesterday") {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (preset === "week") {
      start.setDate(start.getDate() - 6);
    } else if (preset === "month") {
      start.setDate(1);
    }
    setDraftStart(toDateValue(start));
    setDraftEnd(
      preset === "today" || preset === "yesterday" ? "" : toDateValue(end),
    );
    setVisibleMonth(new Date(start.getFullYear(), start.getMonth(), 1));
  };

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={openPicker}
        aria-label="날짜 선택 달력 열기"
        title={
          startDate
            ? endDate
              ? `${formatKoreanDate(startDate)} ~ ${formatKoreanDate(endDate)}`
              : formatKoreanDate(startDate)
            : "날짜 선택"
        }
        className={`flex h-11 w-full items-center rounded-lg border text-sm shadow-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${
          iconOnly
            ? startDate
              ? "justify-center gap-1.5 border-brand-300 bg-brand-50 px-2 font-semibold text-brand-700 hover:bg-brand-100"
              : "justify-center border-gray-300 bg-white px-2 text-gray-500 hover:border-brand-300"
            : "justify-between border-gray-300 bg-white px-3 text-left hover:border-brand-300"
        }`}
      >
        {!iconOnly && (
          <span className={startDate ? "text-gray-800" : "text-gray-400"}>
            {startDate
              ? endDate
                ? `${formatKoreanDate(startDate)} ~ ${formatKoreanDate(endDate)}`
                : formatKoreanDate(startDate)
              : "날짜를 선택하세요"}
          </span>
        )}
        {iconOnly && compactSelection && (
          <span className="whitespace-nowrap text-xs">{compactSelection}</span>
        )}
        <svg
          className={`${iconOnly ? (compactSelection ? "h-4 w-4" : "h-5 w-5") : "ml-3 h-4 w-4"} shrink-0`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[320px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-3 grid grid-cols-4 gap-1">
            {(
              [
                ["today", "오늘"],
                ["yesterday", "어제"],
                ["week", "최근 7일"],
                ["month", "이번 달"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => selectPreset(value)}
                className="h-8 rounded-md bg-gray-100 px-1 text-[11px] font-semibold text-gray-600 hover:bg-brand-50 hover:text-brand-700"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
              className="h-8 w-8 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="이전 달"
            >
              ‹
            </button>
            <strong className="text-sm text-gray-800">
              {year}년 {month + 1}월
            </strong>
            <button
              type="button"
              onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
              className="h-8 w-8 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 text-center">
            {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
              <span
                key={day}
                className={`py-1 text-[11px] font-medium ${index === 0 ? "text-rose-500" : index === 6 ? "text-blue-500" : "text-gray-500"}`}
              >
                {day}
              </span>
            ))}
            {cells.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} />;
              const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isEdge = value === draftStart || value === draftEnd;
              const isInRange =
                Boolean(draftStart && draftEnd) &&
                value > draftStart &&
                value < draftEnd;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`mx-auto my-0.5 flex h-10 w-10 items-center justify-center text-xs transition-colors ${
                    isEdge
                      ? "rounded-full bg-brand-500 font-semibold text-white"
                      : isInRange
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "rounded-lg text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <p className="mt-2 min-h-5 text-center text-xs text-gray-500">
            {draftStart
              ? `${formatKoreanDate(draftStart)}${draftEnd ? ` ~ ${formatKoreanDate(draftEnd)}` : " · 한 날짜로 적용하거나 종료일을 선택하세요"}`
              : "시작일을 선택하세요"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => {
                setDraftStart("");
                setDraftEnd("");
              }}
              className="h-9 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              초기화
            </button>
            <button
              type="button"
              disabled={!draftStart}
              onClick={() => {
                onApply(draftStart, draftEnd);
                setIsOpen(false);
              }}
              className="h-9 rounded-lg bg-brand-500 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
