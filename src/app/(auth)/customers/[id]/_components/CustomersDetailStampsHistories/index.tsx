import {
  ActionInfoLabel,
  LogActorInfo,
  PaymentTypeLabel,
  StoreLabel,
} from '@/app/(auth)/_components/HistoriesComponents';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import useCopy from '@/app/_domains/_log/_hooks/useCopy';
import { CustomersLogsResType } from '@/app/_domains/_log/_types/log.types';
import { updateLogNote, deleteLog } from '@/app/_domains/_log/_services/logService';
import { useCallback } from 'react';
import {
  PaymentTypeEnumType,
  StoreTypeEnumType,
} from '@/app/_enums/enums';
import { groupLogsByDate, formatDateKey } from '@/app/_utils/utils';
import { toast } from 'react-hot-toast';
import { useModal } from '@/app/_contexts/ModalContext';
import DeleteConfirmModal from '@/app/(auth)/_components/DeleteConfirmModal';
import StampLogEditModal from '@/app/(auth)/_components/StampLogEditModal';

const CustomersDetailStampsHistories = ({
  targetUser,
  logs,
  isLoading,
  error,
  isAdmin,
  onDeleteLog,
  onUpdateLog,
}: {
  targetUser: { phone: string; name: string; gender?: 'male' | 'female' | null };
  isLoading: boolean;
  error: string;
  logs: CustomersLogsResType;
  isAdmin: boolean;
  onDeleteLog: (id: string) => void;
  onUpdateLog: (
    id: string,
    updater: (
      item: CustomersLogsResType[number],
    ) => CustomersLogsResType[number],
  ) => void;
}) => {
  const { open, close } = useModal();
  const { copyLogToClipboard } = useCopy();

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

  const handleEdit = useCallback(
    (log: CustomersLogsResType[number]) => {
      const handleSubmit = async (values: {
        note: string;
        paymentType?: PaymentTypeEnumType['value'];
        storeName: StoreTypeEnumType['value'];
      }) => {
        try {
          const updated = await updateLogNote(
            log.id,
            values.note,
            values.paymentType,
            values.storeName,
          );
          onUpdateLog(log.id, (item) => ({
            ...item,
            note: updated.note,
            jsonb: updated.jsonb,
            updated_at: updated.updated_at,
          }));
          close();
          toast.success('이력을 저장했습니다.');
        } catch (e) {
          console.error(e);
          toast.error('저장에 실패했습니다. 다시 시도해 주세요.');
        }
      };

      open({
        content: (
          <StampLogEditModal
            initialNote={log.note ?? ''}
            initialPaymentType={
              log.jsonb?.paymentType as
                | PaymentTypeEnumType['value']
                | undefined
            }
            initialStoreName={
              log.jsonb?.storeName as StoreTypeEnumType['value'] | undefined
            }
            onSubmit={handleSubmit}
            onCancel={close}
          />
        ),
        options: { dismissOnBackdrop: false, dismissOnEsc: true },
      });
    },
    [open, close, onUpdateLog],
  );

  if (error) {
    return (
      <div className="text-center py-8 text-rose-600 text-sm">{error}</div>
    );
  }

  if (isLoading) {
    return <Loading size="lg" text="스탬프 내역 불러오는 중..." />;
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">데이터가 없습니다.</div>
    );
  }

  const { itemsByDate: logsByDate, sortedDates } = groupLogsByDate(logs);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1100px] space-y-3 text-xs sm:text-sm">
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
                  </div>
                  <div className="flex items-center gap-1">
                    {log.jsonb && 'storeName' in log.jsonb && (
                      <StoreLabel jsonb={log.jsonb} />
                    )}
                    {log.jsonb && 'paymentType' in log.jsonb && (
                      <PaymentTypeLabel jsonb={log.jsonb} />
                    )}
                    {typeof log.jsonb?.totalAmount === 'number' &&
                      log.jsonb.totalAmount > 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-1">
                          {log.jsonb.totalAmount.toLocaleString('ko-KR')}원
                        </span>
                      )}
                  </div>
                  <div className="flex-1 pl-4 ml-4 border-l border-brand-100">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => handleEdit(log)}
                      >
                        ✏️
                      </Button>
                      <span className="flex-1 min-w-[240px] text-xs sm:text-sm text-gray-600 break-words whitespace-pre-line">
                        {log.note || (
                          <span className="text-gray-400"> - </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="ml-3 flex-shrink-0 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() =>
                        copyLogToClipboard(log, {
                          name: targetUser.name,
                          phone: targetUser.phone,
                          gender: targetUser.gender,
                        })
                      }
                    >
                      복사
                    </Button>
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
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CustomersDetailStampsHistories;
