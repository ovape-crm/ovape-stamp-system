'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';
import DateRangePicker from '@/app/_components/DateRangePicker';
import { InboundFilters } from '@/app/_domains/_inbound/_queryKeys/inboundKeys';

interface InboundSearchBoxProps {
  onSearch?: (filters: InboundFilters) => void;
}

const InboundSearchBox = ({ onSearch }: InboundSearchBoxProps) => {
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [itemNameInput, setItemNameInput] = useState('');
  const [itemName, setItemName] = useState('');

  const fire = (
    nextStart: string | null,
    nextEnd: string | null,
    nextItemName: string,
  ) => {
    onSearch?.({
      dateFrom: nextStart ?? undefined,
      dateTo: nextEnd ?? undefined,
      itemName: nextItemName || undefined,
    });
  };

  const handleSearch = () => {
    const keyword = itemNameInput.trim();
    setItemName(keyword);
    fire(startDate, endDate, keyword);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-4 sm:p-6">
      <div className="flex flex-col gap-4 text-xs sm:text-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 sm:gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-gray-600">기간 (주문 날짜)</label>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChangeStart={(d) => {
                setStartDate(d);
                fire(d, endDate, itemName);
              }}
              onChangeEnd={(d) => {
                setEndDate(d);
                fire(startDate, d, itemName);
              }}
              onReset={() => {
                setStartDate(null);
                setEndDate(null);
                fire(null, null, itemName);
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 pt-2 border-t border-gray-100">
          <div className="flex-1">
            <input
              type="text"
              placeholder="품목 명으로 검색"
              value={itemNameInput}
              onChange={(e) => setItemNameInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent text-xs sm:text-sm"
            />
          </div>
          <Button onClick={handleSearch} size="sm">
            검색
          </Button>
        </div>

        {itemName && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-full text-xs">
              품목 명 = &quot;{itemName}&quot;
              <button
                type="button"
                onClick={() => {
                  setItemNameInput('');
                  setItemName('');
                  fire(startDate, endDate, '');
                }}
                className="text-brand-400 hover:text-brand-600 font-bold leading-none cursor-pointer"
              >
                ×
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default InboundSearchBox;
