'use client';

import { useState, useCallback } from 'react';
import { PaymentTypeEnumType } from '@/app/_enums/enums';
import { updateLogNote } from '@/services/logService';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { LogsResType } from '@/app/_types/log.types';
import useLogs from '@/app/_hooks/useLogs';
import StampHistoryItem from './StampHistoryItem';

const PAGE_SIZE = 10;

const StampHistories = () => {
  const router = useRouter();
  const { items, setItems, isLoading, error, hasMore, load } =
    useLogs(PAGE_SIZE);

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
      log.jsonb?.paymentType as PaymentTypeEnumType['value'] | undefined
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
          paymentTypeDraft
        );
        setItems((prev) =>
          prev.map((item) =>
            item.id === log.id
              ? { ...item, note: updated.note, jsonb: updated.jsonb }
              : item
          )
        );
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
    [noteDraft, paymentTypeDraft, setItems]
  );

  // 날짜별 그룹핑
  const itemsByDate = items.reduce<Record<string, LogsResType[]>>(
    (acc, log) => {
      const dateKey = new Date(log.created_at).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }); // 예: 25. 12. 02

      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(log);
      return acc;
    },
    {}
  );

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
        <div className="space-y-6">
          {sortedDates.map((dateKey) => {
            const logsOfDate = itemsByDate[dateKey];

            // 보기 좋은 형식으로 변환 (예: "25년 12월 02일")
            const [yyyy, mm, dd] = dateKey.split('.').map((s) => s.trim());
            const prettyDate = `${yyyy}년 ${mm}월 ${dd}일`;

            return (
              <div key={dateKey} className="space-y-4">
                {/* 날짜 헤더 */}
                <div className="w-full py-1">
                  <div className="w-full px-4 py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-center">
                    <span className="text-sm font-semibold text-brand-800 tracking-wide">
                      {prettyDate}
                    </span>
                  </div>
                </div>

                {/* 해당 날짜 로그들 */}
                <div className="space-y-3">
                  {logsOfDate.map((log, index) => {
                    const isEditing = editingId === log.id;
                    const currentNote = isEditing ? noteDraft : log.note ?? '';
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
                      />
                    );
                  })}
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

export default StampHistories;
