'use client';

import { useEffect, useState, useCallback } from 'react';
import { getLogs } from '@/services/logService';
import Loading from '@/_components/Loading';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

interface HistoryItem {
  id: string;
  action: string;
  note: string;
  created_at: string;
  customer_id: number;
  users?: { name?: string | null; email?: string | null } | null;
  customers?: { name?: string | null; phone?: string | null } | null;
}

const PAGE_SIZE = 10;

export default function HistoriesPage() {
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = (await getLogs(PAGE_SIZE, offset)) as HistoryItem[];
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

  const getActionText = (action: string) => {
    if (action.startsWith('add-')) {
      const amount = action.replace('add-', '');
      return {
        text: `${amount}개 추가`,
        color: 'text-emerald-700 bg-emerald-100',
      };
    }
    if (action.startsWith('remove-')) {
      const amount = action.replace('remove-', '');
      return { text: `${amount}개 제거`, color: 'text-rose-700 bg-rose-100' };
    }
    return { text: action, color: 'text-gray-700 bg-gray-100' };
  };

  const formatPhoneNumber = (phone: string | null | undefined): string => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11) {
      // 010-1234-5678 format
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
      // 010-123-4567 or 02-1234-5678 format
      if (digits.startsWith('02')) {
        return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
      } else {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
    }
    return phone;
  };

  const handleCopy = async (log: HistoryItem) => {
    const note = log.note || '';
    const name = log.customers?.name || '이름 없음';
    const phone = formatPhoneNumber(log.customers?.phone);

    const textToCopy = `${note}\t\t\t\t${name}\t${phone}`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success('클립보드에 복사되었습니다!');
    } catch (err) {
      toast.error('복사에 실패했습니다.');
      console.error('Failed to copy:', err);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 mb-10">
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
        <h2 className="text-xl font-semibold text-brand-700 mb-4 pb-3 border-b border-brand-100">
          작업 이력
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
                        {log.customers?.phone || '-'}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 pl-4 ml-4 border-l border-brand-100">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-600 break-words">
                        {log.note || <span className="text-gray-400"> - </span>}
                      </span>
                    </div>
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
                    <button
                      className="px-4 py-2 text-sm font-medium text-brand-700 bg-white border border-brand-300 rounded-lg hover:bg-brand-50 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(log);
                      }}
                    >
                      복사
                    </button>
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
            <button
              onClick={() => void load()}
              className="px-4 py-2 text-sm font-medium text-brand-700 bg-white border border-brand-300 rounded-lg hover:bg-brand-50 transition-all"
            >
              더 불러오기
            </button>
          ) : (
            <div className="text-xs text-gray-400">마지막 페이지입니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}
