'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import { useUser } from '@/app/_contexts/UserContext';
import Logo from '../Header/_components/Logo';
import Nav from '../Header/_components/Nav';

const SideMenu = ({ children }: { children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, isLoading, logout } = useUser();

  const closeMenu = () => setIsOpen(false);

  const userPanel = (
    <div className="rounded-lg border border-brand-100 bg-white/75 p-3 shadow-sm">
      {isLoading ? (
        <Loading size="sm" />
      ) : user ? (
        <div className="space-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-500 text-[10px] font-semibold text-white">
              {user.oss_role}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-700">
                {user.name}
              </p>
              <p className="truncate text-xs text-brand-500">{user.email}</p>
            </div>
          </div>
          <Button size="xs" variant="secondary" className="w-full" onClick={logout}>
            로그아웃
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-brand-100 bg-brand-50/95 shadow-sm backdrop-blur header:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Logo />
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-200 bg-white text-brand-700 shadow-sm"
            aria-label="메뉴 열기"
          >
            <span className="space-y-1.5">
              <span className="block h-0.5 w-5 rounded bg-current" />
              <span className="block h-0.5 w-5 rounded bg-current" />
              <span className="block h-0.5 w-5 rounded bg-current" />
            </span>
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 header:hidden ${
          isOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={closeMenu}
          className={`absolute inset-0 bg-black/30 transition-opacity ${
            isOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-brand-100 bg-brand-50 shadow-xl transition-transform duration-200 ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-brand-100 px-4">
            <Logo />
            <button
              type="button"
              onClick={closeMenu}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-200 bg-white text-sm font-semibold text-brand-700 shadow-sm"
              aria-label="메뉴 닫기"
            >
              X
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-5">
            <Nav orientation="vertical" onNavigate={closeMenu} />
          </div>
          <div className="border-t border-brand-100 px-3 py-4">
            {userPanel}
          </div>
        </aside>
      </div>

      <main className="min-h-screen">{children}</main>
    </div>
  );
};

export default SideMenu;
