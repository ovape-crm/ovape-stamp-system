"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Loading from "@/app/_components/Loading";
import Button from "@/app/_components/Button";
import { useUser } from "@/app/_contexts/UserContext";
import { getCurrentWorker } from "@/app/_domains/_workJournal/_utils/currentWorker";
import {
  acknowledgeOpeningNotice,
  getOpeningCompletionNotice,
  hasAcknowledgedOpeningNotice,
} from "@/app/_domains/_dailyClosing/_services/dailyClosingService";
import type { OpeningCompletionNotice } from "@/app/_domains/_dailyClosing/_types/dailyClosing.types";
import supabase from "@/libs/supabaseClient";

type StaffOpeningStep = "unlocked" | "attendance" | "cash" | "checklist";

type StaffOpeningContextValue = {
  step: StaffOpeningStep;
  isLocked: boolean;
  isLoading: boolean;
  previousCash: number | null;
  refresh: () => Promise<void>;
};

const StaffOpeningContext = createContext<StaffOpeningContextValue | undefined>(
  undefined,
);

const getTodayInKorea = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const isAllowedPathForStep = (
  pathname: string,
  step: StaffOpeningStep,
) =>
  pathname.startsWith("/work-journal") ||
  pathname.startsWith("/cash-management") ||
  (step === "checklist" && pathname.startsWith("/reports"));

export const StaffOpeningProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user, isAdmin, isLoading: isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [step, setStep] = useState<StaffOpeningStep>("unlocked");
  const [previousCash, setPreviousCash] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openingNotice, setOpeningNotice] = useState<OpeningCompletionNotice | null>(null);
  const [noticeBusinessDate, setNoticeBusinessDate] = useState("");
  const [acknowledgingNotice, setAcknowledgingNotice] = useState(false);

  const refresh = useCallback(async () => {
    if (isUserLoading) return;
    if (!user || isAdmin) {
      setStep("unlocked");
      setPreviousCash(null);
      setOpeningNotice(null);
      setIsLoading(false);
      return;
    }

    const today = getTodayInKorea();

    try {
      const { data: latestReport, error: reportError } = await supabase
        .from("daily_closing_reports")
        .select("business_date")
        .lt("business_date", today)
        .order("business_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reportError) throw reportError;

      // 마감 기능을 아직 사용하지 않은 매장은 기존처럼 모든 메뉴를 사용한다.
      if (!latestReport) {
        setStep("unlocked");
        setPreviousCash(null);
        return;
      }

      const { data: previousClosing, error: previousError } = await supabase
        .from("cash_register_closings")
        .select("actual_cash")
        .lte("business_date", latestReport.business_date)
        .order("business_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousError) throw previousError;

      const requiredPreviousCash = previousClosing
        ? Number(previousClosing.actual_cash)
        : null;
      setPreviousCash(requiredPreviousCash);

      const { data: todayClosing, error: todayClosingError } = await supabase
        .from("cash_register_closings")
        .select("opening_cash")
        .eq("business_date", today)
        .maybeSingle();

      if (todayClosingError) throw todayClosingError;

      const openingMatches =
        requiredPreviousCash !== null &&
        todayClosing !== null &&
        Number(todayClosing.opening_cash) === requiredPreviousCash;

      // 당일 시작 시재가 한 번 확인되면 이후 근무자에게도 열린 상태를 유지한다.
      if (openingMatches) {
        const { data: gateItems, error: gateItemsError } = await supabase
          .from("daily_closing_checklist_items")
          .select("id")
          .eq("phase", "opening")
          .eq("is_opening_gate", true);
        if (gateItemsError) throw gateItemsError;

        if (!gateItems?.length) {
          setStep("unlocked");
          return;
        }

        const { data: progress, error: progressError } = await supabase
          .from("daily_opening_checklist_progress")
          .select("checks")
          .eq("business_date", today)
          .maybeSingle();
        if (progressError) throw progressError;

        const checks = (progress?.checks ?? {}) as Record<string, boolean>;
        const isOpeningComplete = gateItems.every((item) => checks[item.id]);
        setStep(isOpeningComplete ? "unlocked" : "checklist");

        if (isOpeningComplete) {
          try {
            const notice = await getOpeningCompletionNotice();
            if (notice?.is_active) {
              const acknowledged = await hasAcknowledgedOpeningNotice(
                today,
                notice.version,
              );
              if (!acknowledged) {
                setNoticeBusinessDate(today);
                setOpeningNotice(notice);
              }
            } else {
              setOpeningNotice(null);
            }
          } catch (noticeError) {
            console.error("Opening completion notice check failed:", noticeError);
          }
        } else {
          setOpeningNotice(null);
        }
        return;
      }

      const currentWorker = getCurrentWorker();
      if (!currentWorker) {
        setStep("attendance");
        return;
      }

      const { data: journal, error: journalError } = await supabase
        .from("work_journals")
        .select("id")
        .eq("work_date", today)
        .eq("worker_name", currentWorker.name)
        .eq("status", "working")
        .maybeSingle();

      if (journalError) throw journalError;
      if (!journal) {
        setStep("attendance");
        return;
      }

      setStep("cash");
    } catch (error) {
      console.error("Staff opening status check failed:", error);
      // 상태 확인 실패 시 스태프 권한을 넓히지 않는다.
      setStep("attendance");
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, isUserLoading, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleAccessChanged = () => void refresh();
    window.addEventListener("staff-opening-changed", handleAccessChanged);
    window.addEventListener("focus", handleAccessChanged);
    return () => {
      window.removeEventListener("staff-opening-changed", handleAccessChanged);
      window.removeEventListener("focus", handleAccessChanged);
    };
  }, [refresh]);

  useEffect(() => {
    if (isLoading || step === "unlocked" || !pathname) return;
    if (isAllowedPathForStep(pathname, step)) return;
    router.replace(step === "attendance" ? "/work-journal" : "/cash-management");
  }, [isLoading, pathname, router, step]);

  const value = useMemo(
    () => ({
      step,
      isLocked: step !== "unlocked",
      isLoading,
      previousCash,
      refresh,
    }),
    [isLoading, previousCash, refresh, step],
  );

  const confirmOpeningNotice = async () => {
    if (!openingNotice || !noticeBusinessDate) return;
    setAcknowledgingNotice(true);
    try {
      await acknowledgeOpeningNotice(noticeBusinessDate, openingNotice.version);
      setOpeningNotice(null);
    } catch (error) {
      console.error("Opening completion notice acknowledgement failed:", error);
    } finally {
      setAcknowledgingNotice(false);
    }
  };

  if (isUserLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading size="lg" text="스태프 영업 시작 상태를 확인하는 중..." />
      </div>
    );
  }

  const isAllowedPath =
    !pathname ||
    step === "unlocked" ||
    isAllowedPathForStep(pathname, step);

  if (!isAllowedPath) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading
          size="lg"
          text={
            step === "attendance"
              ? "출근 처리를 위해 근무일지로 이동하는 중..."
              : "영업 시작 확인으로 이동하는 중..."
          }
        />
      </div>
    );
  }

  return (
    <StaffOpeningContext.Provider value={value}>
      {children}
      {openingNotice && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="opening-completion-notice-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
              <span className="text-xs font-bold text-emerald-600">오픈 완료</span>
              <h2
                id="opening-completion-notice-title"
                className="mt-1 text-lg font-bold text-gray-900"
              >
                {openingNotice.title}
              </h2>
            </div>
            <div className="px-5 py-5 sm:px-6">
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                {openingNotice.content || "오픈 처리가 완료되었습니다."}
              </p>
              <Button
                className="mt-6 w-full"
                onClick={confirmOpeningNotice}
                disabled={acknowledgingNotice}
              >
                {acknowledgingNotice ? "확인 중..." : "확인"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </StaffOpeningContext.Provider>
  );
};

export const useStaffOpening = () => {
  const context = useContext(StaffOpeningContext);
  if (!context) {
    throw new Error(
      "useStaffOpening must be used within a StaffOpeningProvider",
    );
  }
  return context;
};
