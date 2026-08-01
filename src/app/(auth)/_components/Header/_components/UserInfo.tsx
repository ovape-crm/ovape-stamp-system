"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useUser } from "@/app/_contexts/UserContext";
import Loading from "@/app/_components/Loading";
import Button from "@/app/_components/Button";
import supabase from "@/libs/supabaseClient";

type SwitchAccount = {
  id: string;
  name: string;
  email: string;
  oss_role: "staff" | "admin";
};

const hiddenSwitchAccountNames = new Set(["윤동호", "이대양"]);

const UserInfo = () => {
  const { user, isLoading, refreshUser, logout } = useUser();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [accounts, setAccounts] = useState<SwitchAccount[]>([]);
  const [isAccountsLoading, setIsAccountsLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SwitchAccount | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  const loadAccounts = async () => {
    if (accounts.length || isAccountsLoading) return;
    setIsAccountsLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, oss_role")
      .in("oss_role", ["staff", "admin"])
      .order("oss_role")
      .order("name");
    setIsAccountsLoading(false);
    if (error) {
      toast.error("전환할 계정을 불러오지 못했습니다.");
      return;
    }
    setAccounts(
      ((data ?? []) as SwitchAccount[]).filter(
        (account) => !hiddenSwitchAccountNames.has(account.name.trim()),
      ),
    );
  };

  const toggleAccounts = () => {
    setIsOpen((current) => !current);
    if (!isOpen) void loadAccounts();
  };

  const openPasswordModal = (account: SwitchAccount) => {
    if (account.id === user?.id) return;
    setSelectedAccount(account);
    setPassword("");
    setSwitchError("");
    setIsOpen(false);
  };

  const switchAccount = async () => {
    if (!selectedAccount || !password || isSwitching) return;
    setIsSwitching(true);
    setSwitchError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: selectedAccount.email,
      password,
    });
    if (error) {
      setIsSwitching(false);
      setSwitchError("비밀번호가 올바르지 않습니다.");
      return;
    }
    await refreshUser();
    setIsSwitching(false);
    setSelectedAccount(null);
    setPassword("");
    toast.success(`${selectedAccount.name} 계정으로 전환했습니다.`);
    router.refresh();
  };

  if (isLoading) return <Loading size="sm" />;
  if (!user) return null;

  const accountList = (
    <div className="absolute right-0 top-full z-[80] mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
      <p className="border-b border-gray-100 px-4 py-2.5 text-xs font-semibold text-gray-500">
        전환할 계정
      </p>
      <div className="max-h-72 overflow-y-auto p-1.5">
        {isAccountsLoading ? (
          <div className="flex justify-center py-5">
            <Loading size="sm" />
          </div>
        ) : accounts.length ? (
          accounts.map((account) => {
            const isCurrent = account.id === user.id;
            return (
              <button
                key={account.id}
                type="button"
                disabled={isCurrent}
                onClick={() => openPasswordModal(account)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition hover:bg-gray-50 disabled:cursor-default disabled:bg-brand-50/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-900">
                    {account.name}
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {account.email}
                  </span>
                </span>
                <span className="ml-3 shrink-0 text-[11px] font-semibold uppercase text-brand-600">
                  {isCurrent ? "현재" : account.oss_role}
                </span>
              </button>
            );
          })
        ) : (
          <p className="px-3 py-5 text-center text-xs text-gray-500">
            전환할 계정이 없습니다.
          </p>
        )}
      </div>
      <div className="border-t border-gray-100 p-2 header:hidden">
        <Button
          size="xs"
          variant="secondary"
          className="w-full"
          onClick={logout}
        >
          로그아웃
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <div ref={containerRef} className="relative whitespace-nowrap">
        <div className="hidden items-center gap-4 rounded-full border border-brand-200 bg-white/70 px-4 py-2.5 text-sm shadow-sm header:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-500 font-bold text-white">
              <span className="text-xs font-medium leading-tight text-white">
                {user.oss_role}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleAccounts}
              aria-expanded={isOpen}
              className="flex min-w-0 flex-col text-left"
              title="계정 전환"
            >
              <span className="max-w-[160px] truncate text-sm font-semibold leading-tight text-brand-700">
                {user.name}
              </span>
              <span className="max-w-[200px] truncate text-xs leading-tight text-brand-500">
                {user.email}
              </span>
            </button>
          </div>
          <Button size="xs" onClick={logout} variant="secondary">
            로그아웃
          </Button>
        </div>

        <div className="flex items-center header:hidden">
          <button
            type="button"
            onClick={toggleAccounts}
            aria-expanded={isOpen}
            className="flex items-center rounded-full border border-brand-200 bg-white/80 px-2 py-1.5 shadow-sm"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-500 text-[11px] font-bold text-white">
              <span className="text-[10px] font-medium leading-tight text-white">
                {user.oss_role}
              </span>
            </div>
          </button>
        </div>

        {isOpen && accountList}
      </div>

      {selectedAccount &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[180] flex items-center justify-center bg-gray-950/50 p-4">
            <section className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
              <header className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-lg font-bold text-gray-950">계정 전환</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedAccount.name} · {selectedAccount.email}
                </p>
              </header>
              <div className="p-5">
                <label className="block text-sm font-semibold text-gray-700">
                  비밀번호
                  <input
                    autoFocus
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setSwitchError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void switchAccount();
                    }}
                    placeholder="비밀번호를 입력하세요"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                {switchError && (
                  <p className="mt-2 text-sm font-medium text-rose-600">
                    {switchError}
                  </p>
                )}
              </div>
              <footer className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
                <Button
                  variant="gray"
                  onClick={() => setSelectedAccount(null)}
                  disabled={isSwitching}
                >
                  취소
                </Button>
                <Button
                  onClick={() => void switchAccount()}
                  disabled={!password || isSwitching}
                >
                  {isSwitching ? "전환 중..." : "전환"}
                </Button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
};

export default UserInfo;
