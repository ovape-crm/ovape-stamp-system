'use client';

import Loading from '@/app/_components/Loading';
import { useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';
import useLogs from '@/app/_hooks/useLogs';
import { LogCategoryEnum } from '@/app/_enums/enums';
import { groupLogsByDate, formatDateKey } from '@/app/_utils/utils';
import CustomerHistoryItem from './CustomerHistoryItem';

const PAGE_SIZE = 10;

const CustomerHistories = () => {
  const router = useRouter();

  const { items, isLoading, error, hasMore, load } = useLogs(
    PAGE_SIZE,
    LogCategoryEnum.CUSTOMER.value
  );

  const { itemsByDate, sortedDates } = groupLogsByDate(items);

  return (
    <>
      {error && (
        <div className="text-center py-8 text-rose-600 text-xs sm:text-sm">
          {error}
        </div>
      )}

      {items.length === 0 && !isLoading ? (
        <div className="text-center py-12 text-gray-500 text-xs sm:text-sm">
          데이터가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[900px] space-y-3 sm:space-y-4 text-xs sm:text-sm">
            {sortedDates.map((dateKey) => {
              const logsOfDate = itemsByDate[dateKey];
              const prettyDate = formatDateKey(dateKey);

              return (
                <div key={dateKey} className="space-y-3">
                  {/* 날짜 헤더 (StampHistories와 동일 스타일) */}
                  <div className="w-full py-0.5 sm:py-1">
                    <div className="w-full px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-start sm:justify-center">
                      <span className="text-xs sm:text-sm font-semibold text-brand-800 tracking-wide whitespace-nowrap">
                        {prettyDate}
                      </span>
                    </div>
                  </div>

                  {/* 해당 날짜의 로그들 */}
                  <div className="space-y-3">
                    {logsOfDate.map((log, index) => (
                      <CustomerHistoryItem
                        key={`${log.id}-${index}`}
                        log={log}
                        onNavigate={() =>
                          router.push(`/customers/${log.customer_id}`)
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-center">
        {isLoading ? (
          <Loading size="sm" text="불러오는 중..." />
        ) : hasMore ? (
          <Button onClick={() => void load()} variant="secondary" size="sm">
            더 불러오기
          </Button>
        ) : (
          <div className="text-xs text-gray-400">마지막 페이지입니다.</div>
        )}
      </div>
    </>
  );
};

export default CustomerHistories;
