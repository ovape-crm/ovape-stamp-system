"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type VerificationStatus = "loading" | "pending" | "completed" | "expired" | "cancelled" | "rejected" | "invalid" | "error";

const messages: Record<string, { title: string; description: string }> = {
  success: { title: "성인 인증이 완료되었습니다", description: "이 창을 닫아도 됩니다. 인증을 요청한 담당자에게 결과가 전달됩니다." },
  rejected: { title: "성인 인증을 완료할 수 없습니다", description: "성인으로 확인되지 않았습니다. 담당자에게 문의해 주세요." },
  expired: { title: "인증 링크가 만료되었습니다", description: "담당자에게 새로운 인증 링크를 요청해 주세요." },
  invalid: { title: "사용할 수 없는 인증 링크입니다", description: "이미 사용했거나 취소된 링크일 수 있습니다." },
  unavailable: { title: "현재 인증을 시작할 수 없습니다", description: "서비스 설정이 완료되지 않았습니다. 담당자에게 문의해 주세요." },
  error: { title: "인증 처리 중 문제가 발생했습니다", description: "잠시 후 다시 시도하거나 담당자에게 문의해 주세요." },
};

export default function AdultVerificationPage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = params.token;
  const result = searchParams.get("result");
  const [status, setStatus] = useState<VerificationStatus>("loading");

  useEffect(() => {
    if (result) return;
    fetch(`/api/adult-verification/requests/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { status?: VerificationStatus };
        setStatus(data.status ?? "error");
      })
      .catch(() => setStatus("error"));
  }, [result, token]);

  const key = result
    ? result
    : status === "completed"
      ? "success"
      : status === "cancelled"
        ? "invalid"
        : status;
  const message = key !== "pending" && key !== "loading" ? messages[key] ?? messages.error : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">B</div>
        {status === "loading" && !result ? (
          <><h1 className="text-xl font-semibold text-gray-900">인증 링크 확인 중</h1><p className="mt-2 text-sm text-gray-600">잠시만 기다려 주세요.</p></>
        ) : message ? (
          <><h1 className="text-xl font-semibold text-gray-900">{message.title}</h1><p className="mt-3 text-sm leading-6 text-gray-600">{message.description}</p></>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-gray-900">성인 인증</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">비바톤에서 성인 여부만 확인합니다. 인증 결과 외 이름, 생년월일, 전화번호는 이 서비스에 저장하지 않습니다.</p>
            <a href={`/api/adult-verification/bbaton/start?token=${encodeURIComponent(token)}`} className="mt-6 inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">비바톤으로 성인 인증</a>
            <p className="mt-4 text-xs text-gray-500">이 링크는 한 번만 사용할 수 있습니다.</p>
          </>
        )}
      </section>
    </main>
  );
}
