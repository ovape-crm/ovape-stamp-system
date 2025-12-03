'use client';

import Loading from '@/app/_components/Loading';
import { useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';
import useLogs from '@/app/_hooks/useLogs';
import { LogCategoryEnum } from '@/app/_enums/enums';
import CustomerHistoryItem from './CustomerHistoryItem';

const PAGE_SIZE = 10;

const CustomerHistories = () => {
  const router = useRouter();

  const { items, isLoading, error, hasMore, load } = useLogs(
    PAGE_SIZE,
    LogCategoryEnum.CUSTOMER.value
  );

  // 날짜별 그룹핑
  const itemsByDate = items.reduce<Record<string, typeof items>>((acc, log) => {
    const dateKey = new Date(log.created_at).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

  const sortedDates = Object.keys(itemsByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <>
      {error && (
        <div className="text-center py-8 text-rose-600 text-sm">{error}</div>
      )}

      {items.length === 0 && !isLoading ? (
        <div className="text-center py-12 text-gray-500">
          데이터가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((dateKey) => {
            const logsOfDate = itemsByDate[dateKey];
            const [yyyy, mm, dd] = dateKey.split('.').map((s) => s.trim());
            const prettyDate = `${yyyy}년 ${mm}월 ${dd}일`;

            return (
              <div key={dateKey} className="space-y-3">
                {/* 날짜 헤더 (StampHistories와 동일 스타일) */}
                <div className="w-full py-1">
                  <div className="w-full px-4 py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-center">
                    <span className="text-sm font-semibold text-brand-800 tracking-wide">
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
