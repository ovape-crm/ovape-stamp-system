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
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-3 bg-white/70 px-4 py-2 rounded-full border border-brand-200">
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold text-brand-700">
            {user.name || user.email}
          </span>
          {user.oss_role && (
            <span className="text-xs text-brand-500">{user.oss_role}</span>
          )}
        </div>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center text-white font-bold">
          {(user.name || user.email).charAt(0).toUpperCase()}
        </div>
      </div>

      <Button onClick={logout} variant="secondary">
        로그아웃
      </Button>
    </div>
  );
};

export default UserInfo;
