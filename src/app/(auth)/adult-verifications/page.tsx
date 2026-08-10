"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
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
  const [label, setLabel] = useState("");
  const [items, setItems] = useState<VerificationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");

  const loadRequests = useCallback(async () => {
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
      toast.error(error instanceof Error ? error.message : "목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
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

  return (
    <main className="mx-auto mt-10 max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">성인 인증 관리</h1>
        <p className="mt-2 text-sm text-gray-600">
          고객 등록 전에도 일회성 링크를 만들고 인증 완료 여부를 확인할 수 있습니다.
        </p>
      </div>

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
            placeholder="예: 김고객 1234 / 카카오 문의 고객"
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

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-600 sm:text-sm">
          최근 인증 요청 <span className="font-semibold text-brand-600">{items.length}</span>
        </p>
        <Button size="sm" variant="gray" onClick={() => void loadRequests()} disabled={isLoading}>
          새로고침
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-gray-500">불러오는 중...</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">아직 생성된 인증 요청이 없습니다.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{item.request_label}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    요청 {new Date(item.created_at).toLocaleString("ko-KR")}
                    {item.completed_at ? ` · 완료 ${new Date(item.completed_at).toLocaleString("ko-KR")}` : ""}
                  </p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[item.status]}`}>
                  {statusLabels[item.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
