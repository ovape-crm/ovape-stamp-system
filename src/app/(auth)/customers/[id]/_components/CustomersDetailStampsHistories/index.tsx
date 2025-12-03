import {
  ActionInfoLabel,
  LogActorInfo,
  PaymentTypeLabel,
} from '@/app/(auth)/_components/HistoriesComponents';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import useCopy from '@/app/_hooks/useCopy';
import { CustomersLogsResType } from '@/app/_types/log.types';
import { updateLogNote } from '@/services/logService';
import { useCallback, useState } from 'react';
import { PaymentTypeEnum, PaymentTypeEnumType } from '@/app/_enums/enums';
import { toast } from 'react-hot-toast';

const CustomersDetailStampsHistories = ({
  targetUser,
  logs,
  isLoading,
  error,
}: {
  targetUser: { phone: string; name: string };
  isLoading: boolean;
  error: string;
  logs: CustomersLogsResType;
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [noteOverridesById, setNoteOverridesById] = useState<
    Record<string, string>
  >({});
  const [paymentTypeOverridesById, setPaymentTypeOverridesById] = useState<
    Record<string, PaymentTypeEnumType['value'] | undefined>
  >({});
  const [paymentTypeDraft, setPaymentTypeDraft] = useState<
    PaymentTypeEnumType['value'] | undefined
  >(undefined);

  const { copyLogToClipboard } = useCopy();

  const getCurrentNote = useCallback(
    (log: CustomersLogsResType[number]) =>
      noteOverridesById[log.id] ?? log.note ?? '',
    [noteOverridesById]
  );

  const getCurrentPaymentType = useCallback(
    (log: CustomersLogsResType[number]) =>
      paymentTypeOverridesById[log.id] ??
      (log.jsonb?.paymentType as PaymentTypeEnumType['value'] | undefined),
    [paymentTypeOverridesById]
  );

  const startEdit = useCallback(
    (log: CustomersLogsResType[number]) => {
      setEditingId(log.id);
      setNoteDraft(getCurrentNote(log));
      setPaymentTypeDraft(getCurrentPaymentType(log));
    },
    [getCurrentNote, getCurrentPaymentType]
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setNoteDraft('');
    setPaymentTypeDraft(undefined);
  }, []);

  const saveNote = useCallback(
    async (log: CustomersLogsResType[number]) => {
      try {
        setIsSaving(true);
        const updated = await updateLogNote(
          log.id,
          noteDraft,
          paymentTypeDraft
        );
        setNoteOverridesById((prev) => ({ ...prev, [log.id]: updated.note }));
        setPaymentTypeOverridesById((prev) => ({
          ...prev,
          [log.id]: updated.jsonb?.paymentType as
            | PaymentTypeEnumType['value']
            | undefined,
        }));
        setEditingId(null);
        setNoteDraft('');
        setPaymentTypeDraft(undefined);
        toast.success('노트를 저장했습니다.');
      } catch (e) {
        console.error(e);
        toast.error('노트 저장에 실패했습니다. 다시 시도해 주세요.');
      } finally {
        setIsSaving(false);
      }
    },
    [noteDraft, paymentTypeDraft]
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

  const paymentTypeOptions = Object.values(PaymentTypeEnum);

  return logs.map((log) => {
    const isEditing = editingId === log.id;
    const currentNote = getCurrentNote(log);
    const currentPaymentType = getCurrentPaymentType(log);
    const effectivePaymentType = isEditing
      ? paymentTypeDraft
      : currentPaymentType;

    const effectiveJsonb = {
      ...(log.jsonb || {}),
      ...(currentPaymentType ? { paymentType: currentPaymentType } : {}),
    };

    return (
      <div
        key={log.id}
        className="flex items-center justify-between p-3 rounded border border-brand-50 hover:bg-brand-50/30 transition-colors text-sm"
      >
        <div className="flex items-center gap-6">
          <ActionInfoLabel action={log.action} />

          {log.users && (
            <div className="text-left">
              <LogActorInfo users={log.users} created_at={log.created_at} />
            </div>
          )}
        </div>
        {effectiveJsonb && 'paymentType' in effectiveJsonb && (
          <PaymentTypeLabel jsonb={effectiveJsonb} />
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
              {log.jsonb && 'paymentType' in log.jsonb && (
                <div className="flex items-center gap-2">
                  {paymentTypeOptions.map((option) => (
                    <label
                      key={option.value}
                      className="inline-flex items-center gap-2 text-xs whitespace-nowrap"
                    >
                      <input
                        type="radio"
                        name={`paymentType-${log.id}`}
                        value={option.value}
                        checked={effectivePaymentType === option.value}
                        onChange={() => setPaymentTypeDraft(option.value)}
                      />
                      {option.name}
                    </label>
                  ))}
                </div>
              )}
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
                {currentNote || <span className="text-gray-400"> - </span>}
              </span>
            </div>
          )}
        </div>
        <div className="ml-3">
          <Button
            variant="secondary"
            size="xs"
            onClick={() =>
              copyLogToClipboard(log, {
                name: targetUser.name,
                phone: targetUser.phone,
              })
            }
            disabled={isSaving}
          >
            복사
          </Button>
        </div>
      </div>
    );
  });
};

export default CustomersDetailStampsHistories;
