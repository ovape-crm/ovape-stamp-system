import {
  ActionInfoLabel,
  LogActorInfo,
  ChangeFields,
} from '@/app/(auth)/_components/HistoriesComponents';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import { CustomersLogsResType } from '@/app/_types/log.types';
import { deleteLog } from '@/app/_services/logService';
import { useCallback } from 'react';
import { groupLogsByDate, formatDateKey } from '@/app/_utils/utils';
import { toast } from 'react-hot-toast';
import { useModal } from '@/app/_contexts/ModalContext';
import DeleteConfirmModal from '@/app/(auth)/_components/DeleteConfirmModal';

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
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded border border-brand-50 hover:bg-brand-50/30 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-4 sm:gap-6">
                    <ActionInfoLabel action={log.action} />

                    {log.users && (
                      <div className="text-left">
                        <LogActorInfo
                          users={log.users}
                          created_at={log.created_at}
                          updated_at={log.updated_at}
                        />
                      </div>
                    )}

                    {log.jsonb && <ChangeFields jsonb={log.jsonb} />}
                  </div>
                  {isAdmin && (
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={() => handleDelete(log)}
                    >
                      삭제
                    </Button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CustomersDetailUpdateHistories;
