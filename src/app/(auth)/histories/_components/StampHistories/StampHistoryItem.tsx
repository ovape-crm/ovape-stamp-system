'use client';

import Button from '@/app/_components/Button';
import { LogsResType } from '@/app/_domains/_log/_types/log.types';
import {
  ActionInfoLabel,
  CustomerInfo,
  LogActorInfo,
  PaymentTypeLabel,
} from '@/app/(auth)/_components/HistoriesComponents';
import useCopy from '@/app/_domains/_log/_hooks/useCopy';
import { PaymentTypeEnum, PaymentTypeEnumType } from '@/app/_enums/enums';

interface StampHistoryItemProps {
  log: LogsResType;
  isEditing: boolean;
  noteDraft: string;
  currentNote: string;
  paymentType?: PaymentTypeEnumType['value'];
  onNoteChange: (value: string) => void;
  onPaymentTypeChange: (value: PaymentTypeEnumType['value']) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onNavigate: () => void;
  isSaving: boolean;
  isAdmin: boolean;
  onDelete: () => void;
}

const paymentTypeOptions = Object.values(PaymentTypeEnum);

const StampHistoryItem = ({
  log,
  isEditing,
  noteDraft,
  currentNote,
  onNoteChange,
  paymentType,
  onPaymentTypeChange,
  onSave,
  onCancel,
  onEdit,
  onNavigate,
  isSaving,
  isAdmin,
  onDelete,
}: StampHistoryItemProps) => {
  const { copyLogToClipboard } = useCopy();

  return (
    <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors whitespace-nowrap text-xs sm:text-sm">
      <div className="flex items-center gap-2 sm:gap-4">
        <ActionInfoLabel action={log.action} />
        <CustomerInfo
          name={log.customers?.name}
          phone={log.customers?.phone}
          onClick={onNavigate}
        />
      </div>

      {log.jsonb && 'paymentType' in log.jsonb && (
        <PaymentTypeLabel jsonb={log.jsonb} />
      )}

      <div className="flex-1 pl-3 ml-3 sm:pl-4 sm:ml-4 border-l border-brand-100">
        {isEditing ? (
          <div key="edit" className="flex flex-col gap-2 pr-4">
            <textarea
              className="flex-1 text-xs sm:text-sm px-2 py-1.5 sm:py-2 rounded border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none min-h-[50px] sm:min-h-[60px]"
              value={noteDraft}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="메모를 입력하세요"
              disabled={isSaving}
              rows={3}
            />

            {log.jsonb && 'paymentType' in log.jsonb && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {paymentTypeOptions.map((option) => (
                  <label
                    key={option.value}
                    className="inline-flex items-center gap-2 text-xs whitespace-nowrap"
                  >
                    <input
                      type="radio"
                      name={`paymentType-${log.id}`}
                      value={option.value}
                      defaultChecked={paymentType === option.value}
                      onChange={() => onPaymentTypeChange(option.value)}
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
          <div key="view" className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              onClick={onEdit}
              disabled={isSaving}
            >
              ✏️
            </Button>
            <span className="flex-1 text-xs sm:text-sm text-gray-600 break-words whitespace-pre-line">
              {currentNote || <span className="text-gray-400"> - </span>}
            </span>
          </div>
        )}
      </div>

      <div className="text-right">
        {log.users && (
          <LogActorInfo users={log.users} created_at={log.created_at} updated_at={log.updated_at} />
        )}
      </div>

      <div className="ml-4 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            copyLogToClipboard(log, {
              name: log.customers?.name,
              phone: log.customers?.phone,
              gender: log.customers?.gender,
            })
          }
          disabled={isSaving}
        >
          복사
        </Button>
        {isAdmin && (
          <Button
            variant="danger"
            size="sm"
            onClick={onDelete}
            disabled={isSaving}
          >
            삭제
          </Button>
        )}
      </div>
    </div>
  );
};

export default StampHistoryItem;
