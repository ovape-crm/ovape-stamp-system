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

  // 날짜별 그룹핑
  const logsByDate = logs.reduce<Record<string, CustomersLogsResType>>(
    (acc, log) => {
      const dateKey = new Date(log.created_at).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(log);
      return acc;
    },
    {}
  );

  const sortedDates = Object.keys(logsByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return sortedDates.map((dateKey) => {
    const logsOfDate = logsByDate[dateKey];
    const [yyyy, mm, dd] = dateKey.split('.').map((s) => s.trim());
    const prettyDate = `${yyyy}년 ${mm}월 ${dd}일`;

    return (
      <div key={dateKey} className="space-y-3">
        {/* 날짜 헤더 (히스토리와 동일 스타일) */}
        <div className="w-full py-1">
          <div className="w-full px-4 py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-center">
            <span className="text-sm font-semibold text-brand-800 tracking-wide">
              {prettyDate}
            </span>
          </div>
        </div>

        {/* 해당 날짜의 로그들 */}
        {logsOfDate.map((log) => (
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
        ))}
      </div>
    );
  });
};

export default CustomersDetailUpdateHistories;
