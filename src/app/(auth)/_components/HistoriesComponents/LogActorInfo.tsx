import { LogActorUserInfo } from '@/app/_types/log.types';

const LogActorInfo = ({
  users,
  created_at,
  updated_at,
}: {
  users: LogActorUserInfo;
  created_at: string;
  updated_at?: string;
}) => {
  const userDisplay = users?.name || users?.email || '알 수 없음';

  const isModified = updated_at && updated_at !== created_at;

  const displayDate = isModified ? updated_at : created_at;

  const dateText = new Date(displayDate).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <div className="text-xs text-gray-400 mb-1">{userDisplay}</div>
      <div className="flex items-center gap-1 justify-end">
        {isModified && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
            수정됨
          </span>
        )}
        <div className="text-xs text-gray-400">{dateText}</div>
      </div>
    </>
  );
};

export default LogActorInfo;
