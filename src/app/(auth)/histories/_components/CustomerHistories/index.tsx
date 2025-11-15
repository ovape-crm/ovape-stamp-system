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
        <div className="space-y-3">
          {items.map((log, index) => (
            <CustomerHistoryItem
              key={`${log.id}-${index}`}
              log={log}
              onNavigate={() => router.push(`/customers/${log.customer_id}`)}
            />
          ))}
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
