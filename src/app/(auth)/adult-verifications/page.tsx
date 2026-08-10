"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import { useUser } from "@/app/_contexts/UserContext";
import supabase from "@/libs/supabaseClient";

type VerificationRequest = {
  id: string;
  request_label: string;
  status: "pending" | "completed" | "expired" | "cancelled" | "rejected";
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  customer_id: string | null;
};

type StatusFilter = "pending" | "completed" | "rejected" | "all";

const PAGE_SIZE = 5;

const statusLabels: Record<VerificationRequest["status"], string> = {
  pending: "인증 대기",
  completed: "인증 완료",
  expired: "만료",
  cancelled: "취소",
  rejected: "성인 아님",
};

const statusClasses: Record<VerificationRequest["status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  expired: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-600",
  rejected: "bg-rose-50 text-rose-700",
};

const getAccessToken = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session.access_token;
};

export default function AdultVerificationsPage() {
  const { isAdmin } = useUser();
  const [label, setLabel] = useState("");
  const [items, setItems] = useState<VerificationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const tabCounts = useMemo(
    () => ({
      pending: items.filter((item) => item.status === "pending").length,
      completed: items.filter((item) => item.status === "completed").length,
      rejected: items.filter((item) => item.status === "rejected").length,
      all: items.length,
    }),
    [items],
  );

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("ko-KR");
    return items.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesSearch =
        !keyword || item.request_label.toLocaleLowerCase("ko-KR").includes(keyword);
      return matchesStatus && matchesSearch;
    });
  }, [items, search, statusFilter]);

  const visibleItems = filteredItems.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, statusFilter]);

  const loadRequests = useCallback(async (silent = false) => {
    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/adult-verification/requests", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const result = (await response.json()) as {
        items?: VerificationRequest[];
        message?: string;
      };
      if (!response.ok) throw new Error(result.message || "목록을 불러오지 못했습니다.");
      setItems(result.items ?? []);
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "목록을 불러오지 못했습니다.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
    const interval = window.setInterval(() => {
      void loadRequests(true);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [loadRequests]);

  const createLink = async () => {
    if (!label.trim()) {
      toast.error("고객을 구분할 이름이나 메모를 입력해 주세요.");
      return;
    }

    setIsCreating(true);
    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/adult-verification/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ label: label.trim() }),
      });
      const result = (await response.json()) as { url?: string; message?: string };
      if (!response.ok || !result.url) throw new Error(result.message || "링크를 만들지 못했습니다.");

      setCreatedUrl(result.url);
      await navigator.clipboard.writeText(result.url);
      setLabel("");
      toast.success("24시간 유효한 인증 링크를 복사했습니다.");
      await loadRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "링크를 만들지 못했습니다.");
    } finally {
      setIsCreating(false);
    }
  };

  const deleteRequest = async (item: VerificationRequest) => {
    if (!window.confirm(`'${item.request_label}' 인증 요청 기록을 삭제할까요?`)) return;

    setDeletingId(item.id);
    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/adult-verification/requests", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: item.id }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "인증 요청을 삭제하지 못했습니다.");

      setItems((current) => current.filter((request) => request.id !== item.id));
      toast.success("인증 요청 기록을 삭제했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "인증 요청을 삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="mx-auto mt-10 max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
      <section className="mb-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            "인증 링크 생성 후 고객에게 발송",
            "인증 완료 시 고객 추가 및 연동",
            "결제 진행",
          ].map((step, index) => (
            <li
              key={step}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-800 shadow-sm"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">인증 링크 생성</h2>
        <p className="mt-1 text-sm text-gray-600">
          인증자를 구분할 수 있도록 이름, 전화번호 뒷자리 또는 메모를 입력하세요.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={label}
            maxLength={100}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createLink();
            }}
            placeholder="ex) 김고객 1234 / 오베이프 네이버톡톡"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <Button onClick={createLink} disabled={isCreating}>
            {isCreating ? "생성 중..." : "인증 링크 생성"}
          </Button>
        </div>

        {createdUrl && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={createdUrl} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800" />
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(createdUrl);
                  toast.success("인증 링크를 복사했습니다.");
                }}
              >
                복사
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="mb-5 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full rounded-lg border border-gray-200 bg-white p-1 sm:w-auto">
            {([
              ["pending", "인증 대기"],
              ["completed", "인증 완료"],
              ["rejected", "인증 실패"],
              ["all", "전체"],
            ] as const).map(([value, labelText]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`flex-1 cursor-pointer rounded-md px-3 py-2 text-sm font-semibold transition sm:flex-none ${
                  statusFilter === value
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {labelText} {tabCounts[value]}
              </button>
            ))}
          </div>

          <label className="relative block w-full sm:max-w-sm">
            <span className="sr-only">인증 요청 검색</span>
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
              />
            </svg>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="요청명 검색"
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="검색어 지우기"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-base font-medium text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300"
              >
                ×
              </button>
            )}
          </label>
        </div>
      </section>

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-600 sm:text-sm">
          표시 중 <span className="font-semibold text-brand-600">{Math.min(visibleCount, filteredItems.length)}</span>
          <span className="text-gray-400">/{filteredItems.length}</span>
        </p>
        <Button size="sm" variant="gray" onClick={() => void loadRequests()} disabled={isLoading}>
          새로고침
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-gray-500">불러오는 중...</p>
        ) : filteredItems.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">
            {search.trim() ? "검색 결과가 없습니다." : "해당 상태의 인증 요청이 없습니다."}
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{item.request_label}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    요청 {new Date(item.created_at).toLocaleString("ko-KR")}
                    {item.completed_at ? ` · 완료 ${new Date(item.completed_at).toLocaleString("ko-KR")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[item.status]}`}>
                    {statusLabels[item.status]}
                  </span>
                  {isAdmin && (
                    <Button
                      size="xs"
                      variant="danger"
                      disabled={deletingId === item.id}
                      onClick={() => void deleteRequest(item)}
                    >
                      {deletingId === item.id ? "삭제 중..." : "삭제"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {visibleCount < filteredItems.length && (
        <div className="mt-4 flex justify-center">
          <Button
            size="sm"
            variant="gray"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            더보기
          </Button>
        </div>
      )}
    </main>
  );
}
