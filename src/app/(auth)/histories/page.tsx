'use client';

import { useState } from 'react';
import StampHistories from './_components/StampHistories';
import { LogCategoryEnum, LogCategoryEnumType } from '@/app/_enums/enums';
import Button from '@/app/_components/Button';
import CustomerHistories from './_components/CustomerHistories';

export default function HistoriesPage() {
  const [logType, setLogType] = useState<LogCategoryEnumType['value']>(
    LogCategoryEnum.STAMP.value
  );

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 mb-10">
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
        <div className="flex gap-3 mb-4 pb-3 border-b border-brand-100">
          <Button
            onClick={() => setLogType(LogCategoryEnum.STAMP.value)}
            variant={
              logType === LogCategoryEnum.STAMP.value ? 'primary' : 'secondary'
            }
          >
            스탬프 이력
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
        </div>
        {logType === LogCategoryEnum.STAMP.value ? (
          <StampHistories />
        ) : (
          <CustomerHistories />
        )}
      </div>
    </section>
  );
}
