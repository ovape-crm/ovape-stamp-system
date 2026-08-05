'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import StampHistories from './_components/StampHistories';
import { LogCategoryEnum, LogCategoryEnumType } from '@/app/_enums/enums';
import Button from '@/app/_components/Button';
import CustomerHistories from './_components/CustomerHistories';
// import RemarkHistories from './_components/RemarkHistories';

export default function HistoriesPage() {
  const searchParams = useSearchParams();
  const [logType, setLogType] = useState<LogCategoryEnumType['value']>(
    searchParams.get('tab') === 'reservation'
      ? LogCategoryEnum.RESERVATION.value
      : LogCategoryEnum.STAMP.value,
  );

  useEffect(() => {
    if (searchParams.get('tab') === 'reservation') {
      setLogType(LogCategoryEnum.RESERVATION.value);
    }
  }, [searchParams]);

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
              onClick={() => setLogType(LogCategoryEnum.RESERVATION.value)}
              variant={
                logType === LogCategoryEnum.RESERVATION.value
                  ? 'primary'
                  : 'secondary'
              }
            >
              예약 이력
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
        </div>
        {logType === LogCategoryEnum.STAMP.value ? (
          <StampHistories />
        ) : logType === LogCategoryEnum.RESERVATION.value ? (
          <StampHistories
            category={LogCategoryEnum.RESERVATION.value}
            isReservation
          />
        ) : (
          <CustomerHistories />
        )}
      </div>
    </section>
  );
}
