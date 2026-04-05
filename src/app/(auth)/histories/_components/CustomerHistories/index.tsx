'use client';

import { useCallback } from 'react';
import Loading from '@/app/_components/Loading';
import { useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';
import toast from 'react-hot-toast';
import useLogs from '@/app/_domains/_log/_hooks/useLogs';
import { LogCategoryEnum } from '@/app/_enums/enums';
import { groupLogsByDate, formatDateKey } from '@/app/_utils/utils';
import CustomerHistoryItem from './CustomerHistoryItem';
import { deleteLog } from '@/app/_domains/_log/_services/logService';
import { useUser } from '@/app/_contexts/UserContext';
import { LogsResType } from '@/app/_domains/_log/_types/log.types';
import { useModal } from '@/app/_contexts/ModalContext';
import DeleteConfirmModal from '@/app/(auth)/_components/DeleteConfirmModal';

const PAGE_SIZE = 10;

interface CustomerHistoriesProps {
  dateRange?: { start: string; end: string } | null;
}

const CustomerHistories = ({ dateRange }: CustomerHistoriesProps) => {
  const router = useRouter();
  const { isAdmin } = useUser();
  const { open, close } = useModal();

  const { items, removeItem, isLoading, error, hasMore, load } = useLogs(
    PAGE_SIZE,
    LogCategoryEnum.CUSTOMER.value,
    dateRange
  );

  const deleteItem = useCallback(
    (log: LogsResType) => {
      const handleConfirm = async () => {
        try {
          await deleteLog(log.id);
          removeItem(log.id);
          close();
          toast.success('로그를 삭제했습니다.');
        } catch (e) {
          console.error('Failed to delete log:', e);
          toast.error('로그 삭제에 실패했습니다. 다시 시도해 주세요.');
          close();
        }
      };

      open({
        content: (
          <DeleteConfirmModal onConfirm={handleConfirm} onCancel={close} />
        ),
        options: { dismissOnBackdrop: false },
      });
    },
    [removeItem, open, close],
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
                        isAdmin={isAdmin}
                        onDelete={() => deleteItem(log)}
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
