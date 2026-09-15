import Loading from '@/app/_components/Loading';
import { CustomersLogsResType, LogsResType } from '@/app/_domains/_log/_types/log.types';
import { deleteLog } from '@/app/_domains/_log/_services/logService';
import { useCallback } from 'react';
import { groupLogsByDate, formatDateKey } from '@/app/_utils/utils';
import { toast } from 'react-hot-toast';
import { useModal } from '@/app/_contexts/ModalContext';
import DeleteConfirmModal from '@/app/(auth)/_components/DeleteConfirmModal';
import CustomerHistoryItem from '@/app/(auth)/histories/_components/CustomerHistories/CustomerHistoryItem';

const CustomersDetailUpdateHistories = ({
  logs,
  isLoading,
  error,
  isAdmin,
  onDeleteLog,
}: {
  isLoading: boolean;
  error: string;
  logs: CustomersLogsResType;
  isAdmin: boolean;
  onDeleteLog: (id: string) => void;
}) => {
  const { open, close } = useModal();

  const handleDelete = useCallback(
    (log: CustomersLogsResType[number]) => {
      const handleConfirm = async () => {
        try {
          await deleteLog(log.id);
          onDeleteLog(log.id);
          close();
          toast.success('로그를 삭제했습니다.');
        } catch (e) {
          console.error(e);
          toast.error('로그 삭제에 실패했습니다. 다시 시도해 주세요.');
          close();
        }
      };
      open({
        content: <DeleteConfirmModal onConfirm={handleConfirm} onCancel={close} />,
        options: { dismissOnBackdrop: false },
      });
    },
    [onDeleteLog, open, close],
  );

  if (error) {
    return (
      <div className="text-center py-8 text-rose-600 text-sm">{error}</div>
    );
  }

  if (isLoading) {
    return <Loading size="lg" text="고객 정보 수정 내역 불러오는 중..." />;
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        고객 정보 수정 내역이 없습니다.
      </div>
    );
  }

  const { itemsByDate: logsByDate, sortedDates } = groupLogsByDate(logs);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px] space-y-3 text-xs sm:text-sm">
        {sortedDates.map((dateKey) => {
          const logsOfDate = logsByDate[dateKey];
          const prettyDate = formatDateKey(dateKey);

          return (
            <div key={dateKey} className="space-y-3">
              {/* 날짜 헤더 (히스토리와 동일 스타일) */}
              <div className="w-full py-1">
                <div className="w-full px-4 py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-center">
                  <span className="text-xs sm:text-sm font-semibold text-brand-800 tracking-wide whitespace-nowrap">
                    {prettyDate}
                  </span>
                </div>
              </div>

              {/* 해당 날짜의 로그들 */}
              {logsOfDate.map((log) => (
                <CustomerHistoryItem
                  key={log.id}
                  log={{ ...log, customers: { name: '', phone: '' } } as LogsResType}
                  isAdmin={isAdmin}
                  onDelete={() => handleDelete(log)}
                  showCustomerInfo={false}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CustomersDetailUpdateHistories;
