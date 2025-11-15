'use client';

import Loading from '@/app/_components/Loading';
import { useCallback, useMemo, useState } from 'react';
import { updateLogNote } from '@/services/logService';
import { toast } from 'react-hot-toast';
import Button from '@/app/_components/Button';
import { CustomersLogsResType } from '@/app/_types/log.types';
import { getActionText, formatPhoneNumber } from '@/app/_utils/utils';
import {
  LogCategoryEnum,
  LogCategoryEnumType,
  PaymentTypeEnum,
  PaymentTypeEnumType,
} from '@/app/_enums/enums';

const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType['value'], string>
);

// 타입 확장: CustomersLogsResType에 jsonb와 customers가 있을 수 있음
type ExtendedLogType = CustomersLogsResType[number] & {
  jsonb?: Record<string, unknown>;
  customers?: {
    name: string;
    phone: string;
  };
};

interface LogListProps {
  category: LogCategoryEnumType['value'];
  setLogCategory: (category: LogCategoryEnumType['value']) => void;
  logs: CustomersLogsResType;
  isLoading: boolean;
  error: string;
}

const LogList = ({
  category,
  setLogCategory,
  logs,
  isLoading,
  error,
}: LogListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [noteOverridesById, setNoteOverridesById] = useState<
    Record<string, string>
  >({});

  const getCurrentNote = useCallback(
    (log: CustomersLogsResType[number]) =>
      noteOverridesById[log.id] ?? log.note ?? '',
    [noteOverridesById]
  );

  const startEdit = useCallback(
    (log: CustomersLogsResType[number]) => {
      setEditingId(log.id);
      setNoteDraft(getCurrentNote(log));
    },
    [getCurrentNote]
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setNoteDraft('');
  }, []);

  const saveNote = useCallback(
    async (log: CustomersLogsResType[number]) => {
      try {
        setIsSaving(true);
        const updated = await updateLogNote(log.id, noteDraft);
        setNoteOverridesById((prev) => ({ ...prev, [log.id]: updated.note }));
        setEditingId(null);
        setNoteDraft('');
        toast.success('노트를 저장했습니다.');
      } catch (e) {
        console.error(e);
        toast.error('노트 저장에 실패했습니다. 다시 시도해 주세요.');
      } finally {
        setIsSaving(false);
      }
    },
    [noteDraft]
  );

  const handleCopy = useCallback(
    async (log: CustomersLogsResType[number]) => {
      const extendedLog = log as ExtendedLogType;
      const paymentTypeValue = extendedLog.jsonb?.paymentType as
        | PaymentTypeEnumType['value']
        | undefined;

      const paymentTypeName = paymentTypeValue
        ? paymentTypeNameByValue[paymentTypeValue]
        : undefined;

      const note =
        (editingId === log.id ? noteDraft : getCurrentNote(log)) || '';
      const name = extendedLog.customers?.name || '이름 없음';
      const phone = formatPhoneNumber(extendedLog.customers?.phone);

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
    },
    [editingId, noteDraft, getCurrentNote]
  );

  const renderCustomerChanges = useCallback(
    (log: CustomersLogsResType[number]) => {
      const fieldMap = {
        name: '이름',
        phone: '전화번호',
        gender: '성별',
        note: '특이사항',
      } as const;
      const extendedLog = log as ExtendedLogType;
      if (!extendedLog.jsonb) return null;
      const entries = Object.entries(extendedLog.jsonb).filter(
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
                className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500"
              >
                <span className="font-semibold text-gray-600">
                  {fieldMap[field as keyof typeof fieldMap] ?? field}
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
    },
    []
  );

  const isStampCategory = category === LogCategoryEnum.STAMP.value;

  const emptyStateText = useMemo(
    () =>
      isStampCategory
        ? '스탬프 이력이 없습니다.'
        : '고객 정보 수정 이력이 없습니다.',
    [isStampCategory]
  );

  if (isLoading) {
    return <Loading size="sm" text="이력 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center py-8 text-sm text-rose-600">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-4">
      <div className="mb-3 pb-2 border-b border-brand-100 flex gap-2 text-xs">
        <Button
          variant={isStampCategory ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setLogCategory(LogCategoryEnum.STAMP.value)}
        >
          스탬프 이력
        </Button>
        <Button
          variant={!isStampCategory ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setLogCategory(LogCategoryEnum.CUSTOMER.value)}
        >
          고객 이력
        </Button>
      </div>

      <div className="space-y-2.5">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            {emptyStateText}
          </div>
        ) : isStampCategory ? (
          logs.map((log) => {
            const actionInfo = getActionText(log.action);
            const extendedLog = log as ExtendedLogType;
            const paymentTypeValue = extendedLog.jsonb?.paymentType as
              | PaymentTypeEnumType['value']
              | undefined;
            const paymentTypeName = paymentTypeValue
              ? paymentTypeNameByValue[paymentTypeValue]
              : undefined;
            const isEditing = editingId === log.id;
            const currentNote = getCurrentNote(log);
            const userDisplay =
              log.users?.name || log.users?.email || '알 수 없음';
            const createdAtText = new Date(log.created_at).toLocaleString(
              'ko-KR',
              {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }
            );

            return (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 rounded border border-brand-50 hover:bg-brand-50/30 transition-colors text-sm"
              >
                <div className="flex items-center gap-5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${actionInfo.color}`}
                  >
                    {actionInfo.text}
                  </span>
                  <div>
                    <p className="text-[12px] text-gray-500">
                      작업자{' '}
                      <span className="font-medium text-gray-800">
                        {userDisplay}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-400">{createdAtText}</p>
                  </div>
                </div>
                {paymentTypeName && (
                  <div>
                    <span className="ml-3 inline-flex items-center rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium px-2 py-0.5">
                      {paymentTypeName}
                    </span>
                  </div>
                )}
                <div className="flex-1 pl-4 ml-4 border-l border-brand-100">
                  {isEditing ? (
                    <div className="flex flex-col gap-2 pr-4">
                      <textarea
                        className="flex-1 text-sm px-2 py-2 rounded border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none min-h-[50px]"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="메모를 입력하세요"
                        disabled={isSaving}
                        rows={3}
                      />
                      <div className="flex items-center gap-2">
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
                <div className="ml-3">
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => handleCopy(log)}
                    disabled={isSaving}
                  >
                    복사
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          logs.map((log) => {
            const actionInfo = getActionText(log.action);
            const userDisplay =
              log.users?.name || log.users?.email || '알 수 없음';
            const createdAtText = new Date(log.created_at).toLocaleString(
              'ko-KR',
              {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }
            );
            return (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 rounded border border-brand-50 hover:bg-brand-50/30 transition-colors text-sm"
              >
                <div className="flex items-center gap-5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${actionInfo.color}`}
                  >
                    {actionInfo.text}
                  </span>
                  <div>
                    <p className="text-[12px] text-gray-500">
                      작업자{' '}
                      <span className="font-medium text-gray-800">
                        {userDisplay}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-400">{createdAtText}</p>
                  </div>
                  {renderCustomerChanges(log)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LogList;
