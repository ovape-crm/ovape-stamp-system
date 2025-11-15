'use client';

import Button from '@/app/_components/Button';
import { LogsResType } from '@/app/_types/log.types';
import { formatPhoneNumber, getActionText } from '@/app/_utils/utils';
import { PaymentTypeEnum, PaymentTypeEnumType } from '@/app/_enums/enums';

const paymentTypeNameByValue = Object.values(PaymentTypeEnum).reduce(
  (acc, type) => {
    acc[type.value as PaymentTypeEnumType['value']] = type.name;
    return acc;
  },
  {} as Record<PaymentTypeEnumType['value'], string>
);

interface StampHistoryItemProps {
  log: LogsResType;
  isEditing: boolean;
  noteDraft: string;
  currentNote: string;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onNavigate: () => void;
  isSaving: boolean;
}

const StampHistoryItem = ({
  log,
  isEditing,
  noteDraft,
  currentNote,
  onNoteChange,
  onSave,
  onCancel,
  onEdit,
  onCopy,
  onNavigate,
  isSaving,
}: StampHistoryItemProps) => {
  const actionInfo = getActionText(log.action);
  const paymentTypeValue = log.jsonb?.paymentType as
    | PaymentTypeEnumType['value']
    | undefined;
  const paymentTypeName = paymentTypeValue
    ? paymentTypeNameByValue[paymentTypeValue]
    : undefined;
  const userDisplay = log.users?.name || log.users?.email || '알 수 없음';
  const createdAtText = new Date(log.created_at).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors">
      <div className="flex items-center gap-4">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${actionInfo.color}`}
        >
          {actionInfo.text}
        </span>
        <div
          className="cursor-pointer hover:bg-brand-100 hover:shadow-md p-3 rounded-lg transition-all duration-200 border border-transparent hover:border-brand-200"
          onClick={onNavigate}
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
          <div className="flex flex-col gap-2 pr-4">
            <textarea
              className="flex-1 text-sm px-2 py-2 rounded border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none min-h-[60px]"
              value={noteDraft}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="메모를 입력하세요"
              disabled={isSaving}
              rows={3}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="xs"
                onClick={onSave}
                disabled={isSaving}
              >
                저장
              </Button>
              <Button
                variant="secondary"
                size="xs"
                onClick={onCancel}
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
              onClick={onEdit}
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

      <div className="text-right">
        <div className="text-xs text-gray-400 mb-1">{userDisplay}</div>
        <div className="text-xs text-gray-400">{createdAtText}</div>
      </div>
      <div className="ml-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={onCopy}
          disabled={isSaving}
        >
          복사
        </Button>
      </div>
    </div>
  );
};

export default StampHistoryItem;
