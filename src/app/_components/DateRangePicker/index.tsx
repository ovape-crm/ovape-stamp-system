interface DateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  onChangeStart: (date: string | null) => void;
  onChangeEnd: (date: string | null) => void;
  onReset: () => void;
}

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
      <input
        type="date"
        value={startDate ?? ''}
        onChange={(e) => onChangeStart(e.target.value || null)}
        className="px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-brand-200 rounded-lg bg-white/70 text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      />
      <span className="text-xs sm:text-sm text-gray-400">~</span>
      <input
        type="date"
        value={endDate ?? ''}
        onChange={(e) => onChangeEnd(e.target.value || null)}
        min={startDate ?? undefined}
        className="px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-brand-200 rounded-lg bg-white/70 text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      />
      {hasFilter && (
        <button
          type="button"
          onClick={onReset}
          className="px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-lg font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 transition-colors cursor-pointer whitespace-nowrap shadow-sm"
        >
          초기화
        </button>
      )}
    </div>
  );
};

export default DateRangePicker;
