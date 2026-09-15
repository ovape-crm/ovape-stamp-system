'use client';

import { LogsResType } from '@/app/_domains/_log/_types/log.types';
import {
  ActionInfoLabel,
  CustomerInfo,
  LogActorInfo,
  ChangeFields,
} from '@/app/(auth)/_components/HistoriesComponents';
import { Dropdown } from '@/app/_components/Dropdown';

interface CustomerHistoryItemProps {
  log: LogsResType;
  onNavigate?: () => void;
  isAdmin: boolean;
  onDelete: () => void;
  /** 고객 상세에서는 이미 대상 고객이 표시되므로 이름·번호를 생략한다. */
  showCustomerInfo?: boolean;
}

const CustomerHistoryItem = ({ log, onNavigate, isAdmin, onDelete, showCustomerInfo = true }: CustomerHistoryItemProps) => {
  return (
    <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors whitespace-nowrap text-xs sm:text-sm">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <ActionInfoLabel action={log.action} />
          {showCustomerInfo && (
            <CustomerInfo
              name={log.customers?.name}
              phone={log.customers?.phone}
              onClick={onNavigate ?? (() => undefined)}
            />
          )}
        </div>
        {log.jsonb && <ChangeFields jsonb={log.jsonb} />}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          {log.users && (
            <LogActorInfo users={log.users} created_at={log.created_at} updated_at={log.updated_at} jsonb={log.jsonb} />
          )}
        </div>
        {isAdmin && (
          <div className="min-w-[68px] [&>div]:w-full">
            <Dropdown controlledValue="customer-history-actions">
              <Dropdown.Trigger className="relative h-[30px] justify-center !border-brand-200 !bg-brand-100 px-3 py-1.5 text-xs text-brand-700 hover:!border-brand-300 hover:!bg-brand-200 active:!border-brand-300 active:!bg-brand-200 focus:ring-0 focus:ring-offset-0 sm:h-[38px] sm:px-4 sm:py-2 sm:text-sm [&>span]:hidden [&>svg]:absolute [&>svg]:left-1/2 [&>svg]:-translate-x-1/2">{null}</Dropdown.Trigger>
              <Dropdown.Content neutral flush>
                <Dropdown.Item option={{ value: "delete", label: "🗑️" }} neutral showCheck={false} className="flex justify-center whitespace-nowrap !bg-white px-3 py-1.5 text-center text-xs text-rose-600 hover:!bg-brand-100 focus:!ring-0 sm:px-4 sm:py-2 sm:text-sm" onSelect={onDelete} />
              </Dropdown.Content>
            </Dropdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerHistoryItem;
