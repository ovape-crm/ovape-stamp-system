"use client";

import { useRouter } from "next/navigation";
import Button from "@/app/_components/Button";
import { useStaffOpening } from "@/app/_contexts/StaffOpeningContext";

export default function StaffOpeningProgressBanner() {
  const router = useRouter();
  const { step } = useStaffOpening();

  if (step !== "cash" && step !== "checklist") return null;

  const isChecklistStep = step === "checklist";

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
            1 출근 완료
          </span>
          <span
            className={`rounded-full px-2.5 py-1 ${
              isChecklistStep
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-200 text-amber-800"
            }`}
          >
            2 시작 시재
          </span>
          <span
            className={`rounded-full px-2.5 py-1 ${
              isChecklistStep
                ? "bg-amber-200 text-amber-800"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            3 오픈 체크
          </span>
        </div>
        <h2 className="font-bold text-gray-900">
          {isChecklistStep
            ? "시작 시재 저장이 완료되었습니다."
            : "출근 처리가 완료되었습니다."}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {isChecklistStep
            ? "보고서에서 오픈 체크를 모두 완료하면 전체 메뉴가 열립니다."
            : "전날 시재와 일치하도록 오늘의 시작 시재를 저장하면 다음 단계로 진행됩니다."}
        </p>
      </div>
      <Button
        className="shrink-0"
        onClick={() =>
          router.push(
            isChecklistStep
              ? "/reports#opening-checklist"
              : "/cash-management",
          )
        }
      >
        {isChecklistStep ? "보고서 이동하기" : "시재 입력하기"}
      </Button>
    </section>
  );
}
