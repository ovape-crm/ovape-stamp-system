"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toBlob } from "html-to-image";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import KoreanDatePicker from "@/app/_components/KoreanDatePicker";
import {
  cancelDailyClosingReport,
  completeDailyClosingReport,
  getDailyClosingChecklistItems,
  getDailyOpeningChecklistProgress,
  getDailyClosingReport,
  saveDailyOpeningChecklistProgress,
} from "@/app/_domains/_dailyClosing/_services/dailyClosingService";
import { cashManagementKeys } from "@/app/_domains/_cashManagement/_queryKeys/cashManagementKeys";
import type { DailyPaymentSales } from "@/app/_domains/_cashManagement/_types/cashManagement.types";
import type { WorkJournalType } from "@/app/_domains/_workJournal/_types/workJournal.types";
import type {
  DailyClosingChecklistItem,
  DailyClosingChecklistPhase,
} from "@/app/_domains/_dailyClosing/_types/dailyClosing.types";
import { useUser } from "@/app/_contexts/UserContext";
import { useModal } from "@/app/_contexts/ModalContext";
import ConfirmModal from "@/app/(auth)/_components/ConfirmModal";

const defaultChecklistItems: DailyClosingChecklistItem[] = [
  {
    id: "device_login",
    phase: "opening",
    label: "매장 기기 및 업무 계정 로그인 확인",
    sort_order: 0,
    is_required: false,
    is_opening_gate: true,
  },
  {
    id: "stock_check",
    phase: "opening",
    label: "고객 출고 전 시재·재고 확인",
    sort_order: 1,
    is_required: false,
    is_opening_gate: true,
  },
  {
    id: "device_charge",
    phase: "opening",
    label: "시연용 기기와 업무용 기기 충전 확인",
    sort_order: 2,
    is_required: false,
    is_opening_gate: true,
  },
  {
    id: "notification_check",
    phase: "opening",
    label: "업무용 휴대폰 알림 확인",
    sort_order: 3,
    is_required: false,
    is_opening_gate: true,
  },
  {
    id: "restroom",
    phase: "closing",
    label: "화장실 잠금 및 정리 확인",
    sort_order: 0,
    is_required: false,
    is_opening_gate: false,
  },
  {
    id: "sales_check",
    phase: "closing",
    label: "판매처별 매출과 종합 금액 확인",
    sort_order: 1,
    is_required: false,
    is_opening_gate: false,
  },
  {
    id: "device_off",
    phase: "closing",
    label: "에어컨·송풍·조명 전원 확인",
    sort_order: 2,
    is_required: false,
    is_opening_gate: false,
  },
  {
    id: "trash",
    phase: "closing",
    label: "매장 쓰레기 정리",
    sort_order: 3,
    is_required: false,
    is_opening_gate: false,
  },
  {
    id: "door_lock",
    phase: "closing",
    label: "출입문과 창문 잠금 확인",
    sort_order: 4,
    is_required: false,
    is_opening_gate: false,
  },
];

const formatWon = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const getTodayInKorea = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const formatReportDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00+09:00`);
  const dateText = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  return `${dateText} (${weekday})`;
};
const PHOTO_SAVE_ENABLED = false;
const getChecklistDraftKey = (businessDate: string) =>
  `daily-closing-checklist-draft:${businessDate}`;

export default function DailyClosingReport({
  businessDate,
  workJournals,
  paymentSales,
  expectedCash,
  actualCash,
  hasCashClosing,
  showDatePicker = false,
  onDateChange,
}: {
  businessDate: string;
  workJournals: WorkJournalType[];
  paymentSales: DailyPaymentSales;
  expectedCash: number;
  actualCash: number;
  hasCashClosing: boolean;
  showDatePicker?: boolean;
  onDateChange?: (date: string) => void;
}) {
  const { isAdmin } = useUser();
  const captureRef = useRef<HTMLDivElement>(null);
  const { open, close } = useModal();
  const queryClient = useQueryClient();
  const [openingChecks, setOpeningChecks] = useState<Record<string, boolean>>(
    {},
  );
  const [closingChecks, setClosingChecks] = useState<Record<string, boolean>>(
    {},
  );
  const [checksDraftDate, setChecksDraftDate] = useState("");
  const [cleaningNote, setCleaningNote] = useState("");
  const [specialNote, setSpecialNote] = useState("");
  const usesSeparatedOutboundSummary = businessDate >= "2026-07-31";

  const reportQuery = useQuery({
    queryKey: ["daily-closing-report", businessDate],
    queryFn: () => getDailyClosingReport(businessDate),
  });
  const checklistQuery = useQuery({
    queryKey: ["daily-closing-checklist-items"],
    queryFn: getDailyClosingChecklistItems,
  });
  const openingProgressQuery = useQuery({
    queryKey: ["daily-opening-checklist-progress", businessDate],
    queryFn: () => getDailyOpeningChecklistProgress(businessDate),
    enabled: !reportQuery.data,
  });
  const savedChecklistItems = reportQuery.data?.report_snapshot
    ? [
        ...reportQuery.data.report_snapshot.openingChecklist.map(
          (item, index) => ({
            id: item.id,
            phase: "opening" as const,
            label: item.label,
            sort_order: index,
            is_required: item.isRequired,
            is_opening_gate: false,
          }),
        ),
        ...reportQuery.data.report_snapshot.closingChecklist.map(
          (item, index) => ({
            id: item.id,
            phase: "closing" as const,
            label: item.label,
            sort_order: index,
            is_required: item.isRequired,
            is_opening_gate: false,
          }),
        ),
      ]
    : null;
  const checklistItems =
    savedChecklistItems ??
    (checklistQuery.data?.length ? checklistQuery.data : defaultChecklistItems);
  const openingTasks = checklistItems.filter(
    (item) => item.phase === "opening",
  );
  const closingTasks = checklistItems.filter(
    (item) => item.phase === "closing",
  );

  useEffect(() => {
    const savedDraft = window.sessionStorage.getItem(
      getChecklistDraftKey(businessDate),
    );
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft) as {
          openingChecks?: Record<string, boolean>;
          closingChecks?: Record<string, boolean>;
          cleaningNote?: string;
          specialNote?: string;
        };
        setOpeningChecks(parsed.openingChecks ?? {});
        setClosingChecks(parsed.closingChecks ?? {});
        setCleaningNote(parsed.cleaningNote ?? "");
        setSpecialNote(parsed.specialNote ?? "");
      } catch {
        window.sessionStorage.removeItem(getChecklistDraftKey(businessDate));
        setOpeningChecks({});
        setClosingChecks({});
        setCleaningNote("");
        setSpecialNote("");
      }
    } else {
      setOpeningChecks({});
      setClosingChecks({});
      setCleaningNote("");
      setSpecialNote("");
    }
    setChecksDraftDate(businessDate);
  }, [businessDate]);

  useEffect(() => {
    if (checksDraftDate !== businessDate || reportQuery.data) return;
    window.sessionStorage.setItem(
      getChecklistDraftKey(businessDate),
      JSON.stringify({
        openingChecks,
        closingChecks,
        cleaningNote,
        specialNote,
      }),
    );
  }, [
    businessDate,
    checksDraftDate,
    cleaningNote,
    closingChecks,
    openingChecks,
    reportQuery.data,
    specialNote,
  ]);

  useEffect(() => {
    if (!reportQuery.data) return;
    setOpeningChecks(reportQuery.data.opening_checklist ?? {});
    setClosingChecks(reportQuery.data.closing_checklist ?? {});
    setCleaningNote(reportQuery.data.cleaning_note ?? "");
    setSpecialNote(reportQuery.data.special_note ?? "");
  }, [reportQuery.data]);

  useEffect(() => {
    if (reportQuery.data || !openingProgressQuery.data) return;
    setOpeningChecks(openingProgressQuery.data);
  }, [openingProgressQuery.data, reportQuery.data]);

  const requiredItems = [...openingTasks, ...closingTasks].filter(
    (item) => item.is_required,
  );
  const allRequiredChecked = requiredItems.every(
    (item) =>
      (item.phase === "opening" ? openingChecks : closingChecks)[item.id],
  );
  const difference = actualCash - expectedCash;
  const isClosed = Boolean(reportQuery.data);
  const createReportImage = async () => {
    if (!captureRef.current) throw new Error("CAPTURE_TARGET_NOT_FOUND");
    const blob = await toBlob(captureRef.current, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      cacheBust: true,
    });
    if (!blob) throw new Error("IMAGE_CREATE_FAILED");
    return blob;
  };
  const copyReportImage = async () => {
    try {
      const blob = await createReportImage();
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        throw new Error("CLIPBOARD_NOT_SUPPORTED");
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("마감보고서 사진을 복사했습니다.");
    } catch {
      toast.error("사진 복사를 지원하지 않는 환경입니다.");
    }
  };
  const saveReportImage = async () => {
    const blob = await createReportImage();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `마감보고서-${businessDate}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const closeMutation = useMutation({
    mutationFn: () => {
      if (difference !== 0) {
        throw new Error("CASH_BALANCE_MISMATCH");
      }
      return completeDailyClosingReport({
        businessDate,
        openingChecklist: openingChecks,
        closingChecklist: closingChecks,
        cleaningNote,
        specialNote,
        totalSales: paymentSales.total,
        expectedCash,
        actualCash,
        reportSnapshot: {
          version: 1,
          businessDate,
          workers: workJournals.map((journal) => ({
            name: journal.worker_name,
            startTime: journal.start_time.slice(0, 5),
            expectedEndTime:
              journal.expected_end_time?.slice(0, 5) ??
              journal.end_time.slice(0, 5),
            actualEndTime: journal.end_time.slice(0, 5),
            actualWorkHours: Number(journal.work_hours),
            inputWorkHours: Number(journal.input_work_hours ?? 0),
          })),
          payments: paymentSales.breakdown.map((payment) => ({ ...payment })),
          itemSummary: paymentSales.itemSummary.map((item) => ({ ...item })),
          outboundTypeSummary: paymentSales.outboundTypeSummary.map((item) => ({
            ...item,
          })),
          inboundSummary: paymentSales.inboundSummary.map((item) => ({
            ...item,
            aggregationUnit: item.type === "purchase" ? "count" : "quantity",
          })),
          deliverySummary: paymentSales.deliverySummary.map((item) => ({
            ...item,
          })),
          totalSales: paymentSales.total,
          expectedCash,
          actualCash,
          cashDifference: actualCash - expectedCash,
          openingChecklist: openingTasks.map((item) => ({
            id: item.id,
            label: item.label,
            isRequired: item.is_required,
            checked: Boolean(openingChecks[item.id]),
          })),
          closingChecklist: closingTasks.map((item) => ({
            id: item.id,
            label: item.label,
            isRequired: item.is_required,
            checked: Boolean(closingChecks[item.id]),
          })),
          cleaningNote: cleaningNote.trim(),
          specialNote: specialNote.trim(),
          capturedAt: new Date().toISOString(),
        },
      });
    },
    onSuccess: async () => {
      window.sessionStorage.removeItem(getChecklistDraftKey(businessDate));
      toast.success("당일 마감보고서 처리가 완료되었습니다.");
      await Promise.all([
        reportQuery.refetch(),
        queryClient.invalidateQueries({
          queryKey: cashManagementKeys.day(businessDate),
        }),
      ]);
    },
    onError: (error) => {
      const details =
        typeof error === "object" && error !== null
          ? (error as {
              message?: string;
              details?: string;
              hint?: string;
              code?: string;
            })
          : {};
      const message = [
        error instanceof Error ? error.message : details.message,
        details.details,
        details.hint,
        details.code,
      ]
        .filter(Boolean)
        .join(" ");
      console.error("Daily closing failed:", error);
      if (message.includes("INVALID_WORKER_PIN")) {
        toast.error("개인 PIN이 올바르지 않습니다.");
        return;
      }
      if (message.includes("CASH_CLOSING_REQUIRED")) {
        toast.error("먼저 해당 날짜의 시재를 저장해 주세요.");
        return;
      }
      if (message.includes("CASH_BALANCE_MISMATCH")) {
        toast.error("시재 현황이 일치해야 마감할 수 있습니다.");
        return;
      }
      if (message.includes("WORK_JOURNAL_NOT_FOUND")) {
        toast.error("오늘 등록된 근무기록을 찾을 수 없습니다.");
        return;
      }
      if (message.includes("OPEN_WORK_JOURNAL_EXISTS")) {
        toast.error(
          "퇴근하지 않은 근무자가 있습니다. 근무기록에서 먼저 퇴근 처리해 주세요.",
        );
        return;
      }
      if (message.includes("ALREADY_CLOSED")) {
        toast.error("이미 마감 처리된 날짜입니다. 화면을 새로고침해 주세요.");
        void reportQuery.refetch();
        return;
      }
      if (
        message.includes("complete_daily_closing_report") ||
        message.includes("PGRST202") ||
        message.includes("42883")
      ) {
        toast.error(
          "마감 처리 SQL 함수가 최신 상태가 아닙니다. daily_closing_report.sql을 다시 실행해 주세요.",
        );
        return;
      }
      toast.error(`마감 처리 실패: ${message || "알 수 없는 오류"}`);
    },
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelDailyClosingReport(businessDate),
    onSuccess: async () => {
      window.sessionStorage.removeItem(getChecklistDraftKey(businessDate));
      toast.success("마감 처리를 취소했습니다.");
      setOpeningChecks({});
      setClosingChecks({});
      setCleaningNote("");
      setSpecialNote("");
      close();
      await Promise.all([
        reportQuery.refetch(),
        queryClient.invalidateQueries({
          queryKey: cashManagementKeys.day(businessDate),
        }),
      ]);
    },
    onError: (error) => {
      const message =
        typeof error === "object" && error !== null
          ? String((error as { message?: string }).message ?? "")
          : "";
      if (message.includes("CANCEL_NOT_ALLOWED")) {
        toast.error("스태프는 당일 마감만 취소할 수 있습니다.");
      } else if (message.includes("CLOSING_REPORT_NOT_FOUND")) {
        toast.error("취소할 마감 기록을 찾을 수 없습니다.");
      } else {
        toast.error(`마감 취소 실패: ${message || "SQL을 확인해 주세요."}`);
      }
    },
  });
  const canCancelClosing =
    isClosed && (isAdmin || businessDate === getTodayInKorea());
  const handleCompleteClosing = () => {
    open({
      content: (
        <ConfirmModal
          title="마감 전 확인"
          description="매출 금액과 체크리스트를 모두 확인했나요?"
          confirmLabel="마감 처리"
          cancelLabel="다시 확인"
          confirmingLabel="마감 처리 중..."
          onCancel={close}
          onConfirm={async () => {
            try {
              await closeMutation.mutateAsync();
              close();
            } catch {
              // 오류 안내는 closeMutation에서 처리합니다.
            }
          }}
        />
      ),
      options: { dismissOnBackdrop: false },
    });
  };
  const handleCancelClosing = () => {
    open({
      content: (
        <ConfirmModal
          title="마감 취소"
          description="완료된 종합보고서 마감을 취소하시겠습니까?"
          confirmLabel="마감 취소"
          cancelLabel="유지"
          confirmingLabel="취소 중..."
          onCancel={close}
          onConfirm={async () => {
            try {
              await cancelMutation.mutateAsync();
            } catch {
              // 오류 안내는 cancelMutation에서 처리합니다.
            }
          }}
        />
      ),
      options: { dismissOnBackdrop: false },
    });
  };

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    key: string,
  ) => setter((current) => ({ ...current, [key]: !current[key] }));

  const toggleOpening = (key: string) => {
    setOpeningChecks((current) => {
      const next = { ...current, [key]: !current[key] };
      void saveDailyOpeningChecklistProgress(businessDate, next)
        .then(() => {
          queryClient.setQueryData(
            ["daily-opening-checklist-progress", businessDate],
            next,
          );
          window.dispatchEvent(new Event("staff-opening-changed"));
        })
        .catch((error) => {
          console.error(error);
          toast.error("오픈 체크 상태 저장에 실패했습니다.");
          void openingProgressQuery.refetch();
        });
      return next;
    });
  };

  if (reportQuery.isError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        종합보고서 데이터 표를 불러오지 못했습니다. Supabase에서{" "}
        <code className="font-semibold">docs/daily_closing_report.sql</code>을
        먼저 실행해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        {showDatePicker && onDateChange && (
          <div className="w-full sm:w-[280px]">
            <KoreanDatePicker
              value={businessDate}
              onChange={onDateChange}
              selectedLabel="마감보고서 날짜"
            />
          </div>
        )}
        {isClosed && PHOTO_SAVE_ENABLED && (
          <Button size="sm" variant="gray" onClick={saveReportImage}>
            사진 저장
          </Button>
        )}
        {isClosed && (
          <Button size="sm" variant="gray" onClick={copyReportImage}>
            사진 복사
          </Button>
        )}
        <span
          className={`inline-flex rounded-full px-3 py-1.5 text-sm font-bold ${
            isClosed
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {isClosed ? "마감 완료" : "마감 전"}
        </span>
      </div>

      <div ref={captureRef} className="space-y-4 bg-white">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:w-[620px] lg:flex-row lg:items-start">
            <div className="shrink-0">
              <p className="text-xs font-semibold text-gray-500">마감 날짜</p>
              <h2 className="mt-1 text-lg font-bold text-gray-900">
                {formatReportDate(businessDate)}
              </h2>
            </div>
            <div className="h-px bg-gray-200 lg:h-auto lg:w-px lg:self-stretch" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-500">근무자 명단</p>
              <div className="mt-2 grid gap-2">
                {workJournals.length ? (
                  workJournals.map((journal) => (
                    <div
                      key={journal.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                    >
                      <strong className="min-w-0 truncate text-gray-900">
                        {journal.worker_name}
                      </strong>
                      <span className="whitespace-nowrap text-gray-600">
                        {journal.start_time.slice(0, 5)} ~{" "}
                        {journal.status === "working"
                          ? "근무 중"
                          : journal.end_time.slice(0, 5)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">등록된 근무자 없음</p>
                )}
              </div>
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[170px_170px_140px_minmax(0,1fr)]">
            <SalesBreakdownCard
              title="오베이프 매출"
              items={paymentSales.ovapeBreakdown}
              rowCount={Math.max(
                paymentSales.ovapeBreakdown.length,
                paymentSales.eguVapeBreakdown.length,
              )}
            />
            <SalesBreakdownCard
              title="이구베이프 매출"
              items={paymentSales.eguVapeBreakdown}
              rowCount={Math.max(
                paymentSales.ovapeBreakdown.length,
                paymentSales.eguVapeBreakdown.length,
              )}
            />
            <div className="flex min-h-36 flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              <div className="flex min-h-0 flex-1 flex-col p-4">
                <h2 className="border-b border-gray-200 pb-2 text-sm font-bold text-gray-800">
                  시재 현황
                </h2>
                <div className="flex flex-1 items-center justify-center py-3">
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      difference === 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {difference === 0 ? "일치" : "불일치"}
                  </span>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col border-t border-gray-200 p-4">
                <h2 className="border-b border-gray-200 pb-2 text-sm font-bold text-gray-800">
                  총 매출
                </h2>
                <p className="flex flex-1 items-center justify-center whitespace-nowrap py-3 text-center text-xl font-bold text-brand-700">
                  {formatWon(paymentSales.total)}
                </p>
              </div>
            </div>
            {usesSeparatedOutboundSummary ? (
              <div className="min-h-36 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                <div className="grid min-h-36 sm:h-full sm:grid-cols-[180px_180px_130px_minmax(0,1fr)]">
                  <div className="p-4">
                    <h2 className="border-b border-gray-200 pb-2 text-sm font-bold text-gray-800">
                      일반 출고
                    </h2>
                    <div className="mt-3 space-y-2">
                      {paymentSales.itemSummary.length ? (
                        paymentSales.itemSummary.map((item) => (
                          <div
                            key={item.categoryName}
                            className="flex items-center justify-between gap-2 border-b border-gray-200 pb-1.5 text-sm last:border-b-0"
                          >
                            <span className="text-gray-600">
                              {item.categoryName}
                            </span>
                            <strong className="text-gray-900">
                              {item.quantity}개
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400">출고 없음</p>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-gray-300 p-4 sm:border-l sm:border-t-0">
                    <h2 className="border-b border-gray-200 pb-2 text-sm font-bold text-gray-800">
                      나머지 출고
                    </h2>
                    <div className="mt-3 space-y-2">
                      {paymentSales.outboundTypeSummary.length ? (
                        paymentSales.outboundTypeSummary.map((item) => (
                          <div
                            key={`${item.type}-${item.label}`}
                            className="flex items-center justify-between gap-2 border-b border-gray-200 pb-1.5 text-sm last:border-b-0"
                          >
                            <span className="min-w-0 break-all text-gray-600">
                              {item.label}
                            </span>
                            {item.type !== "purchase" && (
                              <strong className="shrink-0 text-gray-900">
                                {item.quantity}개
                              </strong>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400">출고 없음</p>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-gray-300 p-4 sm:border-l sm:border-t-0">
                    <h2 className="border-b border-gray-200 pb-2 text-sm font-bold text-gray-800">
                      수령 방식
                    </h2>
                    <div className="mt-3 space-y-2">
                      {paymentSales.deliverySummary.length ? (
                        paymentSales.deliverySummary.map((item) => (
                          <div
                            key={item.method}
                            className="flex items-center justify-between gap-2 border-b border-gray-200 pb-1.5 text-sm last:border-b-0"
                          >
                            <span className="whitespace-nowrap text-gray-600">
                              {item.label}
                            </span>
                            <strong className="shrink-0 whitespace-nowrap text-gray-900">
                              {item.orderCount}건
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400">등록 없음</p>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-gray-300 p-4 sm:border-l sm:border-t-0">
                    <h2 className="border-b border-gray-200 pb-2 text-sm font-bold text-gray-800">
                      입고
                    </h2>
                    <div className="mt-3 space-y-2">
                      {paymentSales.inboundSummary.length ? (
                        paymentSales.inboundSummary.map((item) => (
                          <div
                            key={`${item.type}-${item.label}`}
                            className="flex items-center justify-between gap-2 border-b border-gray-200 pb-1.5 text-sm last:border-b-0"
                          >
                            <span className="min-w-0 break-all text-gray-600">
                              {item.label}
                            </span>
                            <strong className="shrink-0 text-gray-900">
                              {item.quantity}
                              {item.type === "purchase" ? "건" : "개"}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400">입고 없음</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-36 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <h2 className="border-b border-gray-200 pb-2 text-sm font-bold text-gray-800">
                  판매종류 및 수량
                </h2>
                <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  {paymentSales.itemSummary.length ? (
                    paymentSales.itemSummary.map((item) => (
                      <div
                        key={item.categoryName}
                        className="flex items-center justify-between gap-2 border-b border-gray-200 pb-1.5 text-sm last:border-b-0"
                      >
                        <span className="text-gray-600">
                          {item.categoryName}
                        </span>
                        <strong className="text-gray-900">
                          {item.quantity}
                          {item.categoryName === "택배" ||
                          item.categoryName === "배달"
                            ? "건"
                            : "개"}
                        </strong>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400">판매 품목 없음</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <div
          id="opening-checklist"
          className="grid scroll-mt-24 gap-4 lg:grid-cols-2"
        >
          <Checklist
            title="출근·교대 확인"
            tasks={openingTasks}
            values={openingChecks}
            disabled={isClosed}
            onToggle={toggleOpening}
          />
          <Checklist
            title="마감 확인"
            tasks={closingTasks}
            values={closingChecks}
            disabled={isClosed}
            onToggle={(key) => toggle(setClosingChecks, key)}
          />
        </div>
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700">
              청소 현황·방식
              <textarea
                value={cleaningNote}
                onChange={(event) => setCleaningNote(event.target.value)}
                disabled={isClosed}
                placeholder="예: 창문 닦기, 쇼케이스 닦기, 매장 바닥 청소"
                className="mt-2 h-28 w-full resize-none rounded-xl border border-gray-300 p-3 font-normal outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100"
              />
            </label>
            <label className="text-sm font-semibold text-gray-700">
              특이사항·전달사항
              <textarea
                value={specialNote}
                onChange={(event) => setSpecialNote(event.target.value)}
                disabled={isClosed}
                placeholder="없으면 비워 두어도 됩니다."
                className="mt-2 h-28 w-full resize-none rounded-xl border border-gray-300 p-3 font-normal outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100"
              />
            </label>
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          {canCancelClosing && (
            <Button
              variant="gray"
              onClick={handleCancelClosing}
              disabled={cancelMutation.isPending}
            >
              마감 취소
            </Button>
          )}
        </div>
        <Button
          onClick={handleCompleteClosing}
          disabled={
            isClosed ||
            closeMutation.isPending ||
            !hasCashClosing ||
            !allRequiredChecked ||
            difference !== 0
          }
        >
          {isClosed
            ? "마감 완료"
            : closeMutation.isPending
              ? "마감 처리 중..."
              : "마감 완료"}
        </Button>
      </div>
      {!hasCashClosing && !isClosed && (
        <p className="text-right text-xs font-medium text-rose-600">
          종합보고서를 마감하려면 먼저 시재 저장을 완료해 주세요.
        </p>
      )}
      {hasCashClosing && difference !== 0 && !isClosed && (
        <p className="text-right text-xs font-medium text-rose-600">
          시재 현황이 일치해야 종합보고서를 마감할 수 있습니다.
        </p>
      )}
    </div>
  );
}

function Checklist({
  title,
  tasks,
  values,
  disabled,
  onToggle,
}: {
  title: string;
  tasks: DailyClosingChecklistItem[];
  values: Record<string, boolean>;
  disabled: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="font-bold text-gray-900">{title}</h2>
      <div className="mt-3 space-y-2">
        {tasks.map((item) => {
          const checked = Boolean(values[item.id]);

          return (
            <label
              key={item.id}
              className={`flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 hover:bg-gray-50 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item.id)}
                disabled={disabled}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                  checked
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-gray-300 bg-white text-transparent"
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="m5 10 3 3 7-7"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="text-sm font-medium text-gray-700">
                {item.label}
              </span>
              {item.is_required && (
                <span className="ml-auto shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                  필수
                </span>
              )}
              {item.is_opening_gate && (
                <span
                  className={`${item.is_required ? "" : "ml-auto"} shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700`}
                >
                  오픈
                </span>
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function SalesBreakdownCard({
  title,
  items,
  rowCount,
}: {
  title: string;
  items: DailyPaymentSales["breakdown"];
  rowCount: number;
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return (
    <div className="flex min-h-36 flex-col rounded-xl border border-gray-200 bg-gray-50 p-4">
      <h2 className="border-b border-gray-200 pb-2 text-sm font-bold text-gray-800">
        {title}
      </h2>
      <div className="mt-3 flex flex-1 flex-col">
        <div className="space-y-2">
          {Array.from({ length: rowCount }, (_, index) => {
            const item = items[index];
            return item ? (
              <div
                key={item.paymentType}
                className="flex items-center justify-between gap-2 border-b border-gray-200 pb-1.5 text-sm last:border-b-0"
              >
                <span className="text-gray-600">{item.label}</span>
                <strong className="whitespace-nowrap text-gray-900">
                  {formatWon(item.amount)}
                </strong>
              </div>
            ) : (
              <div
                key={`empty-${index}`}
                aria-hidden="true"
                className="h-[26px] border-b border-transparent"
              />
            );
          })}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-300 pt-2.5 text-sm">
          <strong className="text-gray-700">합계</strong>
          <strong className="whitespace-nowrap text-brand-700">
            {formatWon(total)}
          </strong>
        </div>
      </div>
    </div>
  );
}

export function ChecklistEditor({
  items,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  items: DailyClosingChecklistItem[];
  saving: boolean;
  onChange: (items: DailyClosingChecklistItem[]) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const updateLabel = (id: string, label: string) =>
    onChange(items.map((item) => (item.id === id ? { ...item, label } : item)));
  const removeItem = (id: string) =>
    onChange(items.filter((item) => item.id !== id));
  const addItem = (phase: DailyClosingChecklistPhase) =>
    onChange([
      ...items,
      {
        id: `draft-${phase}-${Date.now()}`,
        phase,
        label: "",
        sort_order: items.filter((item) => item.phase === phase).length,
        is_required: false,
        is_opening_gate: false,
      },
    ]);
  const moveItem = (id: string, direction: -1 | 1) => {
    const currentIndex = items.findIndex((item) => item.id === id);
    const item = items[currentIndex];
    if (!item) return;
    const phaseIndexes = items
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.phase === item.phase)
      .map(({ index }) => index);
    const position = phaseIndexes.indexOf(currentIndex);
    const targetIndex = phaseIndexes[position + direction];
    if (targetIndex === undefined) return;
    const next = [...items];
    [next[currentIndex], next[targetIndex]] = [
      next[targetIndex],
      next[currentIndex],
    ];
    onChange(next);
  };

  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50/30 p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">체크리스트 관리</h2>
          <p className="mt-1 text-xs text-gray-500">
            저장하면 모든 기기와 근무자에게 동일하게 적용됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="gray" onClick={onCancel}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={
              saving ||
              items.some((item) => !item.label.trim()) ||
              !items.some((item) => item.phase === "opening") ||
              !items.some((item) => item.phase === "closing")
            }
          >
            {saving ? "저장 중..." : "변경사항 저장"}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(["opening", "closing"] as const).map((phase) => (
          <div
            key={phase}
            className="rounded-xl border border-gray-200 bg-white p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">
                {phase === "opening" ? "출근·교대 확인" : "마감 확인"}
              </h3>
              <Button size="xs" variant="gray" onClick={() => addItem(phase)}>
                줄 추가
              </Button>
            </div>
            <div className="space-y-2">
              {items
                .filter((item) => item.phase === phase)
                .map((item, index, phaseItems) => (
                  <div key={item.id} className="flex items-center gap-1.5">
                    <input
                      value={item.label}
                      onChange={(event) =>
                        updateLabel(item.id, event.target.value)
                      }
                      placeholder="확인 내용을 입력하세요"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                    <label className="flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-gray-200 px-2 text-xs font-semibold text-gray-600">
                      <input
                        type="checkbox"
                        checked={item.is_required}
                        onChange={(event) =>
                          onChange(
                            items.map((candidate) =>
                              candidate.id === item.id
                                ? {
                                    ...candidate,
                                    is_required: event.target.checked,
                                  }
                                : candidate,
                            ),
                          )
                        }
                        className="h-4 w-4 cursor-pointer accent-brand-500"
                      />
                      필수
                    </label>
                    <button
                      type="button"
                      onClick={() => moveItem(item.id, -1)}
                      disabled={index === 0}
                      className="h-9 w-8 cursor-pointer rounded-md border border-gray-200 text-gray-500 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="위로 이동"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(item.id, 1)}
                      disabled={index === phaseItems.length - 1}
                      className="h-9 w-8 cursor-pointer rounded-md border border-gray-200 text-gray-500 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="아래로 이동"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="h-9 w-8 cursor-pointer rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                      aria-label="줄 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
