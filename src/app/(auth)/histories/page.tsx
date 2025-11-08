'use client';

import { useEffect, useState, useCallback } from 'react';
import { getLogs, updateLogNote } from '@/services/logService';
import Loading from '@/app/_components/Loading';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';
import { LogsResType } from '@/app/_types/log.types';
import { formatPhoneNumber, getActionText } from '@/app/_utils/utils';
import { PaymentTypeEnum, PaymentTypeEnumType } from '@/app/_enums/enums';

const PAGE_SIZE = 10;
const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType['value'], string>
);

export default function HistoriesPage() {
  const router = useRouter();
  const [items, setItems] = useState<LogsResType[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await getLogs(PAGE_SIZE, offset);
      setItems((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setOffset((prev) => prev + data.length);
      if (offset > 0 && data.length > 0) {
        toast.success(`${data.length}개 더 불러오기 성공!`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '에러가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    // first load only
    if (offset === 0 && items.length === 0 && !isLoading) {
      void load();
    }
  }, []); // 의존성 배열을 비워서 한 번만 실행

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
    [noteDraft]
  );

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 mb-10">
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
        <h2 className="text-xl font-semibold text-brand-700 mb-4 pb-3 border-b border-brand-100">
          스탬프 이력
        </h2>

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
              const actionInfo = getActionText(log.action);
              const paymentTypeValue = log.jsonb?.paymentType as
                | PaymentTypeEnumType['value']
                | undefined;
              const paymentTypeName = paymentTypeValue
                ? paymentTypeNameByValue[paymentTypeValue]
                : undefined;
              const isEditing = editingId === log.id;
              const currentNote = isEditing ? noteDraft : log.note ?? '';
              return (
                <div
                  key={`${log.id}-${index}`}
                  className="flex items-center justify-between p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${actionInfo.color}`}
                    >
                      {actionInfo.text}
                    </span>
                    <div
                      className="cursor-pointer hover:bg-brand-100 hover:shadow-md p-3 rounded-lg transition-all duration-200 border border-transparent hover:border-brand-200"
                      onClick={() =>
                        router.push(`/customers/${log.customer_id}`)
                      }
                    >
                      <p className="text-base font-semibold text-gray-900">
                        {log.customers?.name || '이름 없음'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {formatPhoneNumber(log.customers?.phone)}
                      </p>
                    </div>
                  </div>

                  {paymentTypeName && (
                    <div>
                      <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 text-gray-500 text-xs font-medium px-2 py-1">
                        {paymentTypeName}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 pl-4 ml-4 border-l border-brand-100">
                    {isEditing ? (
                      <div className="flex items-center gap-2 pr-4">
                        <input
                          className="flex-1 text-sm px-2 py-2 rounded border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-200"
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="메모를 입력하세요"
                          disabled={isSaving}
                        />
                        <Button
                          variant="primary"
                          size="xs"
                          onClick={() => saveNote(log)}
                          disabled={isSaving}
                        >
                          저장
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={cancelEdit}
                          disabled={isSaving}
                        >
                          취소
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => startEdit(log)}
                          disabled={isSaving}
                        >
                          ✏️
                        </Button>
                        <span className="flex-1 text-sm text-gray-600 break-words whitespace-pre-line">
                          {currentNote || (
                            <span className="text-gray-400"> - </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-gray-400 mb-1">
                      {log.users?.name || log.users?.email || '알 수 없음'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className="ml-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopy(log)}
                      disabled={isSaving}
                    >
                      복사
                    </Button>
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
      </div>
    </section>
  );
}
