'use client';

import { useState, useCallback } from 'react';
import { PaymentTypeEnumType } from '@/app/_enums/enums';
import { updateLogNote, deleteLog } from '@/app/_domains/_log/_services/logService';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { LogsResType } from '@/app/_domains/_log/_types/log.types';
import useLogs from '@/app/_domains/_log/_hooks/useLogs';
import { groupLogsByDate, formatDateKey } from '@/app/_utils/utils';
import StampHistoryItem from './StampHistoryItem';
import { useUser } from '@/app/_contexts/UserContext';
import { useModal } from '@/app/_contexts/ModalContext';
import DeleteConfirmModal from '@/app/(auth)/_components/DeleteConfirmModal';

const PAGE_SIZE = 10;

interface StampHistoriesProps {
  dateRange?: { start: string; end: string } | null;
}

const StampHistories = ({ dateRange }: StampHistoriesProps) => {
  const router = useRouter();
  const { isAdmin } = useUser();
  const { open, close } = useModal();
  const { items, updateItem, removeItem, isLoading, error, hasMore, load } = useLogs(
    PAGE_SIZE,
    undefined,
    dateRange,
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [paymentTypeDraft, setPaymentTypeDraft] = useState<
    PaymentTypeEnumType['value'] | undefined
  >(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = useCallback((log: LogsResType) => {
    setEditingId(log.id);
    setNoteDraft(log.note ?? '');
    setPaymentTypeDraft(
      log.jsonb?.paymentType as PaymentTypeEnumType['value'] | undefined,
    );
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setNoteDraft('');
    setPaymentTypeDraft(undefined);
  }, []);

  const saveNote = useCallback(
    async (log: LogsResType) => {
      try {
        setIsSaving(true);
        const updated = await updateLogNote(
          log.id,
          noteDraft,
          paymentTypeDraft,
        );
        updateItem(log.id, (item) => ({
          ...item,
          note: updated.note,
          jsonb: updated.jsonb,
          updated_at: updated.updated_at,
        }));
        setEditingId(null);
        setNoteDraft('');
        setPaymentTypeDraft(undefined);
        toast.success('노트를 저장했습니다.');
      } catch (e) {
        console.error('Failed to save note:', e);
        toast.error('노트 저장에 실패했습니다. 다시 시도해 주세요.');
      } finally {
        setIsSaving(false);
      }
    },
    [noteDraft, paymentTypeDraft, updateItem],
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
          <div className="min-w-[900px] space-y-4 sm:space-y-6 text-xs sm:text-sm">
            {sortedDates.map((dateKey) => {
              const logsOfDate = itemsByDate[dateKey];

              const prettyDate = formatDateKey(dateKey);

              return (
                <div key={dateKey} className="space-y-4">
                  {/* 날짜 헤더 */}
                  <div className="w-full py-0.5 sm:py-1">
                    <div className="w-full px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-start sm:justify-center">
                      <span className="text-xs sm:text-sm font-semibold text-brand-800 tracking-wide whitespace-nowrap">
                        {prettyDate}
                      </span>
                    </div>
                  </div>

                  {/* 해당 날짜 로그들 */}
                  <div className="space-y-3">
                    {logsOfDate.map((log, index) => {
                      const isEditing = editingId === log.id;
                      const currentNote = isEditing
                        ? noteDraft
                        : (log.note ?? '');
                      return (
                        <StampHistoryItem
                          key={`${log.id}-${index}-${
                            isEditing ? 'edit' : 'view'
                          }`}
                          log={log}
                          isEditing={isEditing}
                          noteDraft={noteDraft}
                          currentNote={currentNote}
                          onNoteChange={setNoteDraft}
                          paymentType={isEditing ? paymentTypeDraft : undefined}
                          onPaymentTypeChange={setPaymentTypeDraft}
                          onSave={() => saveNote(log)}
                          onCancel={cancelEdit}
                          onEdit={() => startEdit(log)}
                          onNavigate={() =>
                            router.push(`/customers/${log.customer_id}`)
                          }
                          isSaving={isSaving}
                          isAdmin={isAdmin}
                          onDelete={() => deleteItem(log)}
                        />
                      );
                    })}
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

export default StampHistories;
