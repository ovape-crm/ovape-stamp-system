'use client';

import Button from '@/app/_components/Button';
import { LogsResType } from '@/app/_domains/_log/_types/log.types';
import {
  ActionInfoLabel,
  CustomerInfo,
  LogActorInfo,
  PaymentTypeLabel,
  StoreLabel,
} from '@/app/(auth)/_components/HistoriesComponents';
import useCopy from '@/app/_domains/_log/_hooks/useCopy';

interface StampHistoryItemProps {
  log: LogsResType;
  onEdit: () => void;
  onNavigate: () => void;
  isAdmin: boolean;
  onDelete: () => void;
  onConfirm?: () => void;
  showCopy?: boolean;
}

const StampHistoryItem = ({
  log,
  onEdit,
  onNavigate,
  isAdmin,
  onDelete,
  onConfirm,
  showCopy = true,
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

      <div className="flex flex-col items-start gap-1">
        {log.jsonb && 'storeName' in log.jsonb && (
          <StoreLabel jsonb={log.jsonb} />
        )}
        {log.jsonb && 'paymentType' in log.jsonb && (
          <PaymentTypeLabel jsonb={log.jsonb} />
        )}
        {typeof log.jsonb?.totalAmount === 'number' &&
          log.jsonb.totalAmount > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-1">
              {log.jsonb.totalAmount.toLocaleString('ko-KR')}원
            </span>
          )}
      </div>

      <div className="flex-1 max-w-[600px] pl-3 ml-3 sm:pl-4 sm:ml-4 border-l border-brand-100">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="xs" onClick={onEdit}>
            ✏️
          </Button>
          <span className="flex-1 min-w-[240px] text-xs sm:text-sm text-gray-600 break-words whitespace-pre-line">
            {log.note || <span className="text-gray-400"> - </span>}
            {typeof log.jsonb?.extraNote === 'string' &&
              log.jsonb.extraNote.trim() && (
                <span className="ml-2 italic text-gray-400">
                  출고 특이사항: &quot;{log.jsonb.extraNote.trim()}&quot;
                </span>
              )}
          </span>
        </div>
      </div>

      <div className="text-right">
        {log.users && (
          <LogActorInfo
            users={log.users}
            created_at={log.created_at}
            updated_at={log.updated_at}
          />
        )}
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-2">
        {onConfirm && (
          <Button variant="primary" size="sm" onClick={onConfirm}>
            출고 확정
          </Button>
        )}
        {showCopy && (
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
          >
            복사
          </Button>
        )}
        {isAdmin && (
          <Button variant="danger" size="sm" onClick={onDelete} aria-label="삭제">
            🗑️
          </Button>
        )}
      </div>
    </div>
  );
};

export default StampHistoryItem;
