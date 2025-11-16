import {
  ActionInfoLabel,
  LogActorInfo,
  ChangeFields,
} from '@/app/(auth)/_components/HistoriesComponents';
import Loading from '@/app/_components/Loading';
import { CustomersLogsResType } from '@/app/_types/log.types';

const CustomersDetailUpdateHistories = ({
  logs,
  isLoading,
  error,
}: {
  isLoading: boolean;
  error: string;
  logs: CustomersLogsResType;
}) => {
  if (error) {
    return (
      <div className="text-center py-8 text-rose-600 text-sm">{error}</div>
    );
  }

  if (isLoading) {
    return <Loading size="lg" text="고객 정보 수정 내역 불러오는 중..." />;
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        고객 정보 수정 내역이 없습니다.
      </div>
    );
  }

  return logs.map((log) => {
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

          {log.jsonb && <ChangeFields jsonb={log.jsonb} />}
        </div>
      </div>
    );
  });
};

export default CustomersDetailUpdateHistories;
