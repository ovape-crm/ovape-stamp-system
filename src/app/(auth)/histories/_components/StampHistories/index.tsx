'use client';

import { useState, useCallback } from 'react';
import { updateLogNote } from '@/services/logService';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { LogsResType } from '@/app/_types/log.types';
import { formatPhoneNumber } from '@/app/_utils/utils';
import { PaymentTypeEnum, PaymentTypeEnumType } from '@/app/_enums/enums';
import useLogs from '@/app/_hooks/useLogs';
import StampHistoryItem from './StampHistoryItem';

const PAGE_SIZE = 10;

const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType['value'], string>
);

const StampHistories = () => {
  const router = useRouter();
  const { items, setItems, isLoading, error, hasMore, load } =
    useLogs(PAGE_SIZE);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleCopy = async (log: LogsResType) => {
    const paymentTypeValue = log.jsonb?.paymentType as
      | PaymentTypeEnumType['value']
      | undefined;

    const paymentTypeName = paymentTypeValue
      ? paymentTypeNameByValue[paymentTypeValue]
      : undefined;

    const note = (editingId === log.id ? noteDraft : log.note) || '';
    const name = log.customers?.name || '이름 없음';
    const phone = formatPhoneNumber(log.customers?.phone);

    const createdAt = new Date(log.created_at);
    const formattedDate = `${createdAt.getFullYear()}. ${String(
      createdAt.getMonth() + 1
    ).padStart(2, '0')}. ${createdAt.getDate()}`;

    const textToCopy = `오베이프\t${formattedDate}\t${note}\t\t\t${
      paymentTypeName ?? ''
    }\t${name}\t${phone}`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success('클립보드에 복사되었습니다!');
    } catch (err) {
      toast.error('복사에 실패했습니다.');
      console.error('Failed to copy:', err);
    }
  };

  const startEdit = useCallback((log: LogsResType) => {
    setEditingId(log.id);
    setNoteDraft(log.note ?? '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setNoteDraft('');
  }, []);

  const saveNote = useCallback(
    async (log: LogsResType) => {
      try {
        setIsSaving(true);
        const updated = await updateLogNote(log.id, noteDraft);
        setItems((prev) =>
          prev.map((item) =>
            item.id === log.id ? { ...item, note: updated.note } : item
          )
        );
        setEditingId(null);
        setNoteDraft('');
        toast.success('노트를 저장했습니다.');
      } catch (e) {
        console.error('Failed to save note:', e);
        toast.error('노트 저장에 실패했습니다. 다시 시도해 주세요.');
      } finally {
        setIsSaving(false);
      }
    },
    [noteDraft, setItems]
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
          {items.map((log, index) => {
            const isEditing = editingId === log.id;
            const currentNote = isEditing ? noteDraft : log.note ?? '';
            return (
              <StampHistoryItem
                key={`${log.id}-${index}`}
                log={log}
                isEditing={isEditing}
                noteDraft={noteDraft}
                currentNote={currentNote}
                onNoteChange={setNoteDraft}
                onSave={() => saveNote(log)}
                onCancel={cancelEdit}
                onEdit={() => startEdit(log)}
                onCopy={() => handleCopy(log)}
                onNavigate={() => router.push(`/customers/${log.customer_id}`)}
                isSaving={isSaving}
              />
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
