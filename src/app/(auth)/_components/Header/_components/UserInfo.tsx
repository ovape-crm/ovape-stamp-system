'use client';

import { useUser } from '@/app/contexts/UserContext';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';

const UserInfo = () => {
  const { user, isLoading, logout } = useUser();

  if (isLoading) {
    return <Loading size="sm" />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 bg-white/70 px-4 py-2.5 rounded-full border border-brand-200 shadow-sm">
      {/* 사용자 정보 */}
      <div className="flex items-center gap-3">
        {/* 아바타 */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
          <span className="text-xs text-white font-medium leading-tight">
            {user.oss_role}
          </span>
        </div>

        {/* 이름 & 이메일 */}
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-brand-700 leading-tight">
            {user.name}
          </span>
          <span className="text-xs text-brand-500 leading-tight">
            {user.email}
          </span>
        </div>
      </div>

      {/* 로그아웃 버튼 */}
      <Button size="xs" onClick={logout} variant="secondary">
        로그아웃
      </Button>
    </div>
  );
};

export default UserInfo;
