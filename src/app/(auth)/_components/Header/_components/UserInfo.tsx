'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/app/_contexts/UserContext';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';

const UserInfo = () => {
  const { user, isLoading, logout } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 드롭다운 외부 클릭 시 닫기 (모바일 터치 포함)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  if (isLoading) {
    return <Loading size="sm" />;
  }

  if (!user) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative whitespace-nowrap">
      {/* Desktop / Tablet: 전체 정보 + 로그아웃 */}
      <div className="hidden header:flex items-center gap-4 bg-white/70 px-4 py-2.5 rounded-full border border-brand-200 shadow-sm text-sm">
        {/* 사용자 정보 */}
        <div className="flex items-center gap-3">
          {/* 아바타 */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center text-white font-bold shrink-0">
            <span className="text-xs text-white font-medium leading-tight">
              {user.oss_role}
            </span>
          </div>

          {/* 이름 & 이메일 */}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-brand-700 leading-tight truncate max-w-[160px]">
              {user.name}
            </span>
            <span className="text-xs text-brand-500 leading-tight truncate max-w-[200px]">
              {user.email}
            </span>
          </div>
        </div>

        {/* 로그아웃 버튼 */}
        <Button size="xs" onClick={logout} variant="secondary">
          로그아웃
        </Button>
      </div>

      {/* Mobile: ADMIN 동그라미만 보이는 트리거 */}
      <div className="flex header:hidden items-center">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center bg-white/80 px-2 py-1.5 rounded-full border border-brand-200 shadow-sm"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center text-white font-bold text-[11px] shrink-0">
            <span className="text-[10px] text-white font-medium leading-tight">
              {user.oss_role}
            </span>
          </div>
        </button>
      </div>

      {/* Mobile Dropdown */}
      <div
        className={`absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-brand-200 p-3 header:hidden z-50 transform origin-top-right transition-all duration-150 ease-out ${
          isOpen
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className="flex gap-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center text-white font-bold text-[11px] shrink-0">
              <span className="text-[10px] text-white font-medium leading-tight">
                {user.oss_role}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-brand-700 leading-tight truncate">
                {user.name}
              </span>
              <span className="text-[11px] text-brand-500 leading-tight truncate">
                {user.email}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end mt-1">
            <Button
              size="xs"
              variant="secondary"
              className="px-2 py-1 text-[11px]"
              onClick={logout}
            >
              로그아웃
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserInfo;
