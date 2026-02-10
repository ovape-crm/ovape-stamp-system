'use client';

import { LogsResType } from '@/app/_types/log.types';
import {
  ActionInfoLabel,
  CustomerInfo,
  LogActorInfo,
  ChangeFields,
} from '@/app/(auth)/_components/HistoriesComponents';

interface CustomerHistoryItemProps {
  log: LogsResType;
  onNavigate: () => void;
}

const CustomerHistoryItem = ({ log, onNavigate }: CustomerHistoryItemProps) => {
  return (
    <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors whitespace-nowrap text-xs sm:text-sm">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <ActionInfoLabel action={log.action} />
          <CustomerInfo
            name={log.customers?.name}
            phone={log.customers?.phone}
            onClick={onNavigate}
          />
        </div>
        {log.jsonb && <ChangeFields jsonb={log.jsonb} />}
      </div>

      <div className="text-right">
        {log.users && (
          <LogActorInfo users={log.users} created_at={log.created_at} />
        )}
      </div>
    </div>
  );
};

export default CustomerHistoryItem;
