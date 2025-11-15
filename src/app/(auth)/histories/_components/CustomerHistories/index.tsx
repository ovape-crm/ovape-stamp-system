'use client';

import Loading from '@/app/_components/Loading';
import { useRouter } from 'next/navigation';
import Button from '@/app/_components/Button';
import { LogsResType } from '@/app/_types/log.types';
import { formatPhoneNumber, getActionText } from '@/app/_utils/utils';
import useLogs from '@/app/_hooks/useLogs';
import { LogCategoryEnum } from '@/app/_enums/enums';

const PAGE_SIZE = 10;

const CustomerHistories = () => {
  const router = useRouter();
  const { items, isLoading, error, hasMore, load } = useLogs(
    PAGE_SIZE,
    LogCategoryEnum.CUSTOMER.value
  );

  const renderChanges = (log: LogsResType) => {
    const fieldMap = {
      name: '이름',
      phone: '전화번호',
      gender: '성별',
      note: '특이사항',
    } as const;

    if (!log.jsonb) return null;
    const entries = Object.entries(log.jsonb).filter(
      ([, value]) =>
        value &&
        typeof value === 'object' &&
        ('old' in (value as Record<string, unknown>) ||
          'new' in (value as Record<string, unknown>))
    );

    if (entries.length === 0) return null;

    const formatValue = (value: unknown) => {
      if (value === null || value === undefined || value === '') return '-';
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      }
      return String(value);
    };

    return (
      <div className="mt-2 space-y-1">
        {entries.map(([field, value]) => {
          const change = value as { old?: unknown; new?: unknown };
          return (
            <div
              key={field}
              className="flex flex-wrap items-center gap-2 text-xs text-gray-500"
            >
              <span className="font-semibold text-gray-600">
                {fieldMap[field as keyof typeof fieldMap]}
              </span>
              {'old' in change && (
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                  {formatValue(change.old)}
                </span>
              )}
              {'old' in change && 'new' in change && (
                <span className="text-gray-400">→</span>
              )}
              {'new' in change && (
                <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700">
                  {formatValue(change.new)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

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
            const actionInfo = getActionText(log.action);

            return (
              <div
                key={`${log.id}-${index}`}
                className="flex items-center justify-between p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors"
              >
                <div className="flex items-center gap-4">
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
                  {renderChanges(log)}
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

export default CustomerHistories;
