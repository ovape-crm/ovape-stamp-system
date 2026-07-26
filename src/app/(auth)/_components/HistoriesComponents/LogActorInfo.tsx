import { LogActorUserInfo } from '@/app/_domains/_log/_types/log.types';

const LogActorInfo = ({
  users,
  created_at,
  updated_at,
  jsonb,
}: {
  users: LogActorUserInfo;
  created_at: string;
  updated_at?: string;
  jsonb?: Record<string, unknown>;
}) => {
  const createdWorkerName =
    typeof jsonb?.createdWorkerName === 'string'
      ? jsonb.createdWorkerName
      : '';
  const modifiedWorkerName =
    typeof jsonb?.modifiedWorkerName === 'string'
      ? jsonb.modifiedWorkerName
      : '';
  const modifiedAt =
    typeof jsonb?.modifiedAt === 'string' ? jsonb.modifiedAt : updated_at;
  const userDisplay =
    createdWorkerName || users?.name || users?.email || '알 수 없음';

  const isModified = Boolean(modifiedWorkerName && modifiedAt);
  const formatDate = (value: string) => new Date(value).toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const createdDateText = formatDate(created_at);
  const modifiedDateText = modifiedAt ? formatDate(modifiedAt) : '';

  return (
    <>
      <div className="text-xs text-gray-500">
        작업자 · <span className="font-medium text-gray-700">{userDisplay}</span>
      </div>
      <div className="mt-0.5 text-xs text-gray-400">{createdDateText}</div>
      {isModified && (
        <div className="mt-1 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-500">
          수정 · <span className="font-medium">{modifiedWorkerName}</span>
          <span className="ml-1">{modifiedDateText}</span>
        </div>
      )}
    </>
  );
};

export default LogActorInfo;
