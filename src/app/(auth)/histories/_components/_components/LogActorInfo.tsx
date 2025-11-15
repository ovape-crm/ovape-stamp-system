import { LogActorUserInfo } from '@/app/_types/log.types';

const LogActorInfo = ({
  users,
  created_at,
}: {
  users: LogActorUserInfo;
  created_at: string;
}) => {
  const userDisplay = users?.name || users?.email || '알 수 없음';

  const createdAtText = new Date(created_at).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <div className="text-xs text-gray-400 mb-1">{userDisplay}</div>
      <div className="text-xs text-gray-400">{createdAtText}</div>
    </>
  );
};

export default LogActorInfo;
