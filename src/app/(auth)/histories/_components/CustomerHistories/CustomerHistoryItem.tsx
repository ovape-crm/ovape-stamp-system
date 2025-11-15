'use client';

import { LogsResType } from '@/app/_types/log.types';
import ActionInfoLabel from '../_components/ActionInfoLabel';
import CustomerInfo from '../_components/CustomerInfo';
import ChangeFields from '../_components/ChangeFields';
import LogActorInfo from '../_components/LogActorInfo';

interface CustomerHistoryItemProps {
  log: LogsResType;
  onNavigate: () => void;
}

const CustomerHistoryItem = ({ log, onNavigate }: CustomerHistoryItemProps) => {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-brand-50 hover:bg-brand-50/30 transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-4">
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
