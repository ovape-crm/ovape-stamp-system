'use client';

import { useState } from 'react';
import StampHistories from './_components/StampHistories';
import { LogCategoryEnum, LogCategoryEnumType } from '@/app/_enums/enums';
import Button from '@/app/_components/Button';
import CustomerHistories from './_components/CustomerHistories';
// import RemarkHistories from './_components/RemarkHistories';
import DateRangePicker from '@/app/_components/DateRangePicker';

export default function HistoriesPage() {
  const [logType, setLogType] = useState<LogCategoryEnumType['value']>(
    LogCategoryEnum.STAMP.value,
  );
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  const dateRange =
    startDate && endDate ? { start: startDate, end: endDate } : null;

  const handleReset = () => {
    setStartDate(null);
    setEndDate(null);
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 mb-10">
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4 pb-3 border-b border-brand-100">
          <div className="flex gap-1 sm:gap-3">
            <Button
              onClick={() => setLogType(LogCategoryEnum.STAMP.value)}
              variant={
                logType === LogCategoryEnum.STAMP.value
                  ? 'primary'
                  : 'secondary'
              }
            >
              출고 이력
            </Button>
            <Button
              onClick={() => setLogType(LogCategoryEnum.CUSTOMER.value)}
              variant={
                logType === LogCategoryEnum.CUSTOMER.value
                  ? 'primary'
                  : 'secondary'
              }
            >
              고객 이력
            </Button>
            {/* <Button
              onClick={() => setLogType(LogCategoryEnum.REMARK.value)}
              variant={
                logType === LogCategoryEnum.REMARK.value ? 'primary' : 'secondary'
              }
            >
              특이사항 이력
            </Button> */}
          </div>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChangeStart={setStartDate}
            onChangeEnd={setEndDate}
            onReset={handleReset}
          />
        </div>
        {logType === LogCategoryEnum.STAMP.value ? (
          <StampHistories dateRange={dateRange} />
        ) : (
          <CustomerHistories dateRange={dateRange} />
        )}
      </div>
    </section>
  );
}
