"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import { Dropdown, DropdownOption } from "@/app/_components/Dropdown";
import Loading from "@/app/_components/Loading";
import { KoreanDateRangePicker } from "@/app/_components/KoreanDatePicker";
import {
  createWorkJournal,
  createWorker,
  closeHandoverWithoutSuccessor,
  deactivateWorker,
  deleteWorkJournal,
  getWorkJournals,
  getWorkJournalsByRange,
  getWorkerDetails,
  getWorkerNames,
  updateWorkJournalPaymentStatus,
  updateWorkJournal,
  updateWorkerDetails,
  verifyWorkerPin,
} from "@/app/_domains/_workJournal/_services/workJournalService";
import { workJournalKeys } from "@/app/_domains/_workJournal/_queryKeys/workJournalKeys";
import WorkerCreateModal from "./_components/WorkerCreateModal";
import AttendanceRecordModal from "./_components/AttendanceRecordModal";
import { useUser } from "@/app/_contexts/UserContext";
import StaffOpeningProgressBanner from "@/app/(auth)/_components/StaffOpeningProgressBanner";
import {
  WorkJournalType,
  WorkPaymentStatus,
} from "@/app/_domains/_workJournal/_types/workJournal.types";

const getTodayInKorea = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const formatHours = (hours: number) =>
  Number.isInteger(hours)
    ? `${hours}시간`
    : `${hours.toFixed(2).replace(/0+$/, "")}시간`;

const getPayableHours = (journal: WorkJournalType) =>
  Number(journal.input_work_hours ?? journal.work_hours);

const formatKoreanDate = (date: string) => {
  if (!date) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${date}T00:00:00`));
};

const isWorkEnded = (status?: WorkJournalType["status"]) =>
  status === "closed" ||
  status === "handover_pending" ||
  status === "shift_completed";

const getWorkStatusLabel = (status?: WorkJournalType["status"]) => {
  if (status === "handover_pending") return "인수인계 대기";
  if (status === "shift_completed") return "교대 완료";
  if (status === "closed") return "퇴근 완료";
  return "근무 중";
};

export default function WorkJournalPage() {
  const queryClient = useQueryClient();
  const { isAdmin } = useUser();
  const today = getTodayInKorea();
  const [activeTab, setActiveTab] = useState<
    "records" | "payment" | "workers"
  >("records");
  const [tabOrder, setTabOrder] = useState<
    ("records" | "workers" | "payment")[]
  >(["records", "workers", "payment"]);
  const [editingTabOrder, setEditingTabOrder] = useState(false);
  const [showWorkForm, setShowWorkForm] = useState(false);
  const [recordWorkerName, setRecordWorkerName] = useState("");
  const [recordWorkerPin, setRecordWorkerPin] = useState("");
  const [verifiedWorkerName, setVerifiedWorkerName] = useState("");
  const [isVerifyingWorker, setIsVerifyingWorker] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const [viewMode, setViewMode] = useState<"month" | "range">("month");
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const workerFilter = verifiedWorkerName === "전체" ? "" : verifiedWorkerName;
  const [paymentMonth, setPaymentMonth] = useState(today.slice(0, 7));
  const [paymentWorkerFilter, setPaymentWorkerFilter] = useState("");
  const [workDate, setWorkDate] = useState(today);
  const [workerName, setWorkerName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [workHours, setWorkHours] = useState("");
  const [note, setNote] = useState("");
  const [workerPin, setWorkerPin] = useState("");
  const [workType, setWorkType] = useState<"solo" | "shift">("solo");
  const [editingJournalId, setEditingJournalId] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("work-journal-tab-order");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as (
        | "records"
        | "workers"
        | "payment"
      )[];
      if (
        parsed.length === 3 &&
        ["records", "workers", "payment"].every((tab) => parsed.includes(tab as "records" | "workers" | "payment"))
      ) {
        setTabOrder(parsed);
      }
    } catch {
      window.localStorage.removeItem("work-journal-tab-order");
    }
  }, []);

  const moveTab = (index: number, direction: -1 | 1) => {
    setTabOrder((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      window.localStorage.setItem(
        "work-journal-tab-order",
        JSON.stringify(next),
      );
      return next;
    });
  };

  const journalsQuery = useQuery({
    queryKey:
      viewMode === "month"
        ? workJournalKeys.month(selectedMonth, workerFilter)
        : workJournalKeys.range(startDate, endDate, workerFilter),
    queryFn: () =>
      viewMode === "month"
        ? getWorkJournals(selectedMonth, workerFilter)
        : getWorkJournalsByRange(startDate, endDate, workerFilter),
    enabled:
      Boolean(verifiedWorkerName) &&
      (viewMode === "month" ||
        Boolean(startDate && endDate && startDate <= endDate)),
  });
  const workersQuery = useQuery({
    queryKey: workJournalKeys.workers(),
    queryFn: getWorkerNames,
  });
  const workerDetailsQuery = useQuery({
    queryKey: workJournalKeys.workerDetails(),
    queryFn: getWorkerDetails,
    enabled: isAdmin,
  });
  const paymentQuery = useQuery({
    queryKey: workJournalKeys.month(paymentMonth, paymentWorkerFilter),
    queryFn: () => getWorkJournals(paymentMonth, paymentWorkerFilter),
    enabled: isAdmin && activeTab === "payment",
  });

  const summary = useMemo(() => {
    const journals = journalsQuery.data ?? [];
    const totalHours = journals.reduce(
      (sum, journal) => sum + Number(journal.work_hours),
      0,
    );
    return {
      totalHours,
      attendanceCount: journals.length,
    };
  }, [journalsQuery.data]);

  const paymentGroups = useMemo(() => {
    const groups = new Map<string, WorkJournalType[]>();
    for (const journal of paymentQuery.data ?? []) {
      const journals = groups.get(journal.worker_name) ?? [];
      journals.push(journal);
      groups.set(journal.worker_name, journals);
    }
    return Array.from(groups, ([groupWorkerName, journals]) => ({
      workerName: groupWorkerName,
      journals,
      unpaid: journals.filter(
        (journal) => (journal.payment_status ?? "unpaid") === "unpaid",
      ),
      advance: journals.filter(
        (journal) => journal.payment_status === "advance",
      ),
      salary: journals.filter((journal) => journal.payment_status === "salary"),
    })).sort((a, b) => a.workerName.localeCompare(b.workerName, "ko"));
  }, [paymentQuery.data]);

  const resetWorkForm = () => {
    setWorkDate(today);
    setWorkerName("");
    setStartTime("");
    setEndTime("");
    setWorkHours("");
    setNote("");
    setWorkerPin("");
    setWorkType("solo");
    setEditingJournalId("");
  };

  const createMutation = useMutation({
    mutationFn: createWorkJournal,
    onSuccess: async () => {
      toast.success(
        "출근 처리가 완료되었습니다. 다음으로 시작 시재를 확인해 주세요.",
      );
      setSelectedMonth(workDate.slice(0, 7));
      resetWorkForm();
      setShowWorkForm(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workJournalKeys.all() }),
        queryClient.invalidateQueries({ queryKey: workJournalKeys.workers() }),
      ]);
    },
    onError: (error: { code?: string; message?: string }) => {
      if (error.message === "INVALID_WORKER_PIN") {
        toast.error("근무자 PIN 번호가 일치하지 않습니다.");
        return;
      }
      if (error.code === "23505") {
        toast.error("같은 날짜에 같은 근무자의 기록이 이미 있습니다.");
        return;
      }
      toast.error(
        "저장에 실패했습니다. 먼저 work_journal.sql을 실행했는지 확인해 주세요.",
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Parameters<typeof updateWorkJournal>[1];
    }) => updateWorkJournal(id, values),
    onSuccess: async () => {
      toast.success("근무 기록이 수정되었습니다.");
      setSelectedMonth(workDate.slice(0, 7));
      resetWorkForm();
      setShowWorkForm(false);
      await queryClient.invalidateQueries({ queryKey: workJournalKeys.all() });
    },
    onError: (error: { code?: string }) => {
      if (error.code === "23505") {
        toast.error("같은 날짜에 같은 근무자의 기록이 이미 있습니다.");
        return;
      }
      toast.error("근무 기록 수정에 실패했습니다.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkJournal,
    onSuccess: async () => {
      toast.success("근무 기록이 삭제되었습니다.");
      await queryClient.invalidateQueries({ queryKey: workJournalKeys.all() });
    },
    onError: () => toast.error("근무 기록 삭제에 실패했습니다."),
  });

  const closeHandoverMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      closeHandoverWithoutSuccessor(id, reason),
    onSuccess: async () => {
      toast.success("교대 없이 퇴근 완료 처리했습니다.");
      await queryClient.invalidateQueries({ queryKey: workJournalKeys.all() });
    },
    onError: () => toast.error("인수인계 대기 종료에 실패했습니다."),
  });

  const paymentMutation = useMutation({
    mutationFn: (variables: {
      journalIds: string[];
      status: WorkPaymentStatus;
      fromStatus?: WorkPaymentStatus;
      successMessage: string;
    }) =>
      updateWorkJournalPaymentStatus(
        variables.journalIds,
        variables.status,
        variables.fromStatus,
      ),
    onSuccess: async (_, variables) => {
      toast.success(variables.successMessage);
      await queryClient.invalidateQueries({ queryKey: workJournalKeys.all() });
    },
    onError: () => toast.error("지급 상태 변경에 실패했습니다."),
  });

  const handleAdvanceToggle = (journal: WorkJournalType) => {
    const isAdvance = journal.payment_status === "advance";
    if (isAdvance && !window.confirm("선지급 처리를 취소하시겠습니까?")) return;

    paymentMutation.mutate({
      journalIds: [journal.id],
      status: isAdvance ? "unpaid" : "advance",
      fromStatus: isAdvance ? "advance" : "unpaid",
      successMessage: isAdvance
        ? "선지급 처리가 취소되었습니다."
        : "선지급 처리되었습니다.",
    });
  };

  const handleWorkerSalaryPayment = (group: (typeof paymentGroups)[number]) => {
    if (!group.unpaid.length) return;
    const advanceNotice = group.advance.length
      ? ` 선지급 ${group.advance.length}건은 그대로 유지됩니다.`
      : "";
    if (
      !window.confirm(
        `${group.workerName}님의 미지급 근무 ${group.unpaid.length}건을 월급 지급 처리하시겠습니까?${advanceNotice}`,
      )
    )
      return;

    paymentMutation.mutate({
      journalIds: group.unpaid.map((journal) => journal.id),
      status: "salary",
      fromStatus: "unpaid",
      successMessage: `${group.workerName}님의 월급 지급 처리가 완료되었습니다.`,
    });
  };

  const handleWorkerSalaryCancel = (group: (typeof paymentGroups)[number]) => {
    if (
      !group.salary.length ||
      !window.confirm(
        `${group.workerName}님의 월급 지급 ${group.salary.length}건을 미지급으로 되돌리시겠습니까?`,
      )
    )
      return;

    paymentMutation.mutate({
      journalIds: group.salary.map((journal) => journal.id),
      status: "unpaid",
      fromStatus: "salary",
      successMessage: `${group.workerName}님의 월급 지급 처리가 취소되었습니다.`,
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const hours = Number(workHours);

    if (!workDate || !workerName.trim() || !startTime || !endTime) {
      toast.error("날짜, 근무자 이름, 출근·퇴근 시간을 모두 입력해 주세요.");
      return;
    }
    if (!editingJournalId && workerPin.length !== 4) {
      toast.error("근무자 PIN 4자리를 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      toast.error("근무시간은 0보다 크고 24 이하인 숫자로 입력해 주세요.");
      return;
    }

    const values = {
      workDate,
      workerName,
      startTime,
      endTime,
      workHours: hours,
      note,
      workType,
      pin: workerPin,
    };

    if (editingJournalId) {
      updateMutation.mutate({ id: editingJournalId, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleStartEditing = (journal: WorkJournalType) => {
    setActiveTab("records");
    setShowWorkForm(true);
    setEditingJournalId(journal.id);
    setWorkDate(journal.work_date);
    setWorkerName(journal.worker_name);
    setStartTime(journal.start_time.slice(0, 5));
    setEndTime(journal.end_time.slice(0, 5));
    setWorkHours(String(journal.work_hours));
    setNote(journal.note ?? "");
    setWorkType(journal.work_type ?? "solo");
    document
      .getElementById("work-journal-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleVerifyRecordWorker = async () => {
    if (!recordWorkerName || recordWorkerPin.length !== 4) {
      toast.error("근무자와 개인 PIN 4자리를 입력해 주세요.");
      return;
    }
    try {
      setIsVerifyingWorker(true);
      const verified = await verifyWorkerPin(recordWorkerName, recordWorkerPin);
      if (!verified) {
        toast.error("근무자 PIN 번호가 일치하지 않습니다.");
        return;
      }
      setVerifiedWorkerName(recordWorkerName);
      setRecordWorkerPin("");
      toast.success(`${recordWorkerName}님의 근무기록을 불러왔습니다.`);
    } catch {
      toast.error("근무자 확인에 실패했습니다.");
    } finally {
      setIsVerifyingWorker(false);
    }
  };

  const handleTabChange = (tab: "records" | "workers" | "payment") => {
    if (tab !== activeTab) {
      resetWorkForm();
      setShowWorkForm(false);
      setRecordWorkerName("");
      setRecordWorkerPin("");
      setVerifiedWorkerName("");
      setViewMode("month");
      setSelectedMonth(today.slice(0, 7));
      setStartDate(`${today.slice(0, 7)}-01`);
      setEndDate(today);
    }
    setActiveTab(tab);
  };

  if (
    journalsQuery.isError ||
    workersQuery.isError ||
    (isAdmin && workerDetailsQuery.isError) ||
    (isAdmin && activeTab === "payment" && paymentQuery.isError)
  ) {
    return (
      <div className="mx-auto mt-10 max-w-3xl rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        근무일지 데이터 표를 불러오지 못했습니다. Supabase에서{" "}
        <code className="font-semibold">docs/work_journal.sql</code>을 먼저
        실행해 주세요.
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <StaffOpeningProgressBanner />
      <div className="flex items-end justify-between border-b border-gray-200">
        <div className="flex min-w-0 overflow-x-auto" role="tablist" aria-label="근무기록 메뉴">
          {tabOrder.map((tab, index) => {
            if (!isAdmin && tab !== "records") return null;
            const label =
              tab === "records"
                ? "근무기록"
                : tab === "workers"
                  ? "근무자 관리"
                  : "급여 지급";
            return (
              <div key={tab} className="flex shrink-0 items-center">
                {editingTabOrder && (
                  <button
                    type="button"
                    onClick={() => moveTab(index, -1)}
                    disabled={index === 0}
                    className="h-7 w-6 cursor-pointer text-xs text-gray-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-20"
                    aria-label={`${label} 왼쪽으로 이동`}
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => handleTabChange(tab)}
                  className={`cursor-pointer border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
                    activeTab === tab
                      ? "border-brand-500 text-brand-700"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  }`}
                >
                  {label}
                </button>
                {editingTabOrder && (
                  <button
                    type="button"
                    onClick={() => moveTab(index, 1)}
                    disabled={index === tabOrder.length - 1}
                    className="h-7 w-6 cursor-pointer text-xs text-gray-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-20"
                    aria-label={`${label} 오른쪽으로 이동`}
                  >
                    →
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setEditingTabOrder((current) => !current)}
          className={`mb-2 ml-3 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border bg-white transition ${
            editingTabOrder
              ? "border-brand-300 text-brand-700 shadow-sm"
              : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-700"
          }`}
          aria-label={editingTabOrder ? "탭 순서 변경 완료" : "탭 순서 변경"}
          title={editingTabOrder ? "탭 순서 변경 완료" : "탭 순서 변경"}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Zm7.25-3.25c0-.48-.05-.95-.14-1.4l2.02-1.57-2-3.46-2.48 1a7.4 7.4 0 0 0-2.42-1.4L13.88 2.5h-4l-.35 2.67a7.4 7.4 0 0 0-2.42 1.4l-2.48-1-2 3.46 2.02 1.57a7.18 7.18 0 0 0 0 2.8l-2.02 1.57 2 3.46 2.48-1a7.4 7.4 0 0 0 2.42 1.4l.35 2.67h4l.35-2.67a7.4 7.4 0 0 0 2.42-1.4l2.48 1 2-3.46-2.02-1.57c.09-.45.14-.92.14-1.4Z" />
          </svg>
        </button>
      </div>

      {activeTab === "workers" && isAdmin && (
        <WorkerCreateModal
          embedded
          onCancel={() => handleTabChange("records")}
          workers={workerDetailsQuery.data ?? []}
          onDelete={async (name) => {
            try {
              await deactivateWorker(name);
              if (workerName === name) setWorkerName("");
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: workJournalKeys.workers(),
                }),
                queryClient.invalidateQueries({
                  queryKey: workJournalKeys.workerDetails(),
                }),
              ]);
              toast.success("근무자가 선택 목록에서 삭제되었습니다.");
            } catch {
              toast.error("근무자 삭제에 실패했습니다.");
              throw new Error("근무자 삭제 실패");
            }
          }}
          onUpdate={async (workerId, values) => {
            try {
              await updateWorkerDetails(workerId, values);
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: workJournalKeys.workers(),
                }),
                queryClient.invalidateQueries({
                  queryKey: workJournalKeys.workerDetails(),
                }),
              ]);
              toast.success("근무자 정보가 수정되었습니다.");
            } catch {
              toast.error("근무자 정보 수정에 실패했습니다.");
              throw new Error("근무자 정보 수정 실패");
            }
          }}
          onCreate={async (values) => {
            try {
              await createWorker(values);
              setWorkerName(values.name);
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: workJournalKeys.workers(),
                }),
                queryClient.invalidateQueries({
                  queryKey: workJournalKeys.workerDetails(),
                }),
              ]);
              toast.success("근무자가 추가되었습니다.");
            } catch (error) {
              if ((error as { code?: string }).code === "23505") {
                toast.error("이미 등록된 근무자 이름입니다.");
                return;
              }
              toast.error("근무자 추가에 실패했습니다.");
              throw error;
            }
          }}
        />
      )}

      {activeTab === "records" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:w-auto sm:flex-row sm:items-stretch">
            <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
              <p className="mb-1 text-xs font-semibold text-gray-600">
                근무자 이름
              </p>
              <Dropdown controlledValue={recordWorkerName}>
                <Dropdown.Trigger compact>
                  {recordWorkerName || "선택"}
                </Dropdown.Trigger>
                 <Dropdown.Content compact>
                   {isAdmin && (
                     <Dropdown.Item
                       option={{ value: "전체", label: "전체" }}
                       compact
                       onSelect={(selected: DropdownOption) => {
                         const selectedName = String(selected.value);
                         setRecordWorkerName(selectedName);
                         setRecordWorkerPin("");
                         setVerifiedWorkerName(selectedName);
                         setViewMode("month");
                         setSelectedMonth(today.slice(0, 7));
                         setStartDate(`${today.slice(0, 7)}-01`);
                         setEndDate(today);
                       }}
                     />
                   )}
                   {(workersQuery.data ?? []).map((name) => (
                    <Dropdown.Item
                      key={name}
                      option={{ value: name, label: name }}
                      compact
                       onSelect={(selected: DropdownOption) => {
                         const selectedName = String(selected.value);
                         setRecordWorkerName(selectedName);
                         setRecordWorkerPin("");
                         setVerifiedWorkerName(isAdmin ? selectedName : "");
                        setViewMode("month");
                        setSelectedMonth(today.slice(0, 7));
                        setStartDate(`${today.slice(0, 7)}-01`);
                        setEndDate(today);
                      }}
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
            {recordWorkerName && !isAdmin && (
              <>
                <div className="hidden w-px shrink-0 self-stretch bg-gray-300 sm:block" />
                <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
                  <p className="mb-1 text-xs font-semibold text-gray-600">
                    개인 PIN
                  </p>
                  {verifiedWorkerName ? (
                    <div className="flex h-11 w-full items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-sm font-semibold text-brand-700 shadow-sm">
                      입력완료
                    </div>
                  ) : (
                    <input
                      type="password"
                      inputMode="numeric"
                      value={recordWorkerPin}
                      onChange={(event) => {
                        setRecordWorkerPin(
                          event.target.value.replace(/\D/g, "").slice(0, 4),
                        );
                        setVerifiedWorkerName("");
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          recordWorkerPin.length === 4
                        ) {
                          void handleVerifyRecordWorker();
                        }
                      }}
                      maxLength={4}
                      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-center text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      placeholder="4자리"
                    />
                  )}
                </div>
              </>
            )}
            {recordWorkerName && !isAdmin && recordWorkerPin.length === 4 && (
              <>
                <div className="hidden w-px shrink-0 self-stretch bg-gray-300 sm:block" />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 min-w-16 self-center px-3"
                  disabled={isVerifyingWorker}
                  onClick={() => void handleVerifyRecordWorker()}
                >
                  {isVerifyingWorker ? "조회 중..." : "조회"}
                </Button>
              </>
            )}
            {verifiedWorkerName && (
              <>
                <div className="hidden w-px shrink-0 self-stretch bg-gray-300 sm:block" />
                <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
                  <p className="mb-1 text-xs font-semibold text-gray-600">
                    조회 기간
                  </p>
                  <Dropdown controlledValue={viewMode}>
                    <Dropdown.Trigger compact>
                      {viewMode === "month" ? "당월" : "날짜 선택"}
                    </Dropdown.Trigger>
                    <Dropdown.Content compact>
                      {(
                        [
                          { value: "month", label: "당월" },
                          { value: "range", label: "날짜 선택" },
                        ] as const
                      ).map((option) => (
                        <Dropdown.Item
                          key={option.value}
                          option={option}
                          compact
                          onSelect={(selected: DropdownOption) => {
                            const nextMode = selected.value as "month" | "range";
                            setViewMode(nextMode);
                            if (nextMode === "month") {
                              setSelectedMonth(today.slice(0, 7));
                              setStartDate(`${today.slice(0, 7)}-01`);
                              setEndDate(today);
                            } else {
                              setStartDate("");
                              setEndDate("");
                            }
                          }}
                        />
                      ))}
                    </Dropdown.Content>
                  </Dropdown>
                </div>
                {viewMode === "range" && (
                  <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[120px] sm:shrink-0">
                    <p className="mb-1 text-xs font-semibold text-gray-600">
                      날짜 선택
                    </p>
                    <KoreanDateRangePicker
                      startDate={startDate}
                      endDate={endDate}
                      iconOnly
                      onApply={(start, end) => {
                        setStartDate(start);
                        setEndDate(end);
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            className="self-center sm:shrink-0"
            onClick={() => {
              resetWorkForm();
              setShowWorkForm(true);
            }}
          >
            출퇴근 기록추가
          </Button>
        </div>
      )}

      {false && activeTab === "records" && showWorkForm && editingJournalId && (
        <section
          id="work-journal-form"
          className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm"
        >
          {editingJournalId && (
            <div className="mb-4 flex justify-end">
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                수정 중
              </span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_0.8fr]">
              <Field label="근무 날짜">
                <div className="[&_button>span]:whitespace-nowrap">
                  <KoreanDatePicker value={workDate} onChange={setWorkDate} />
                </div>
              </Field>
              <Field label="근무 유형">
                <select
                  value={workType}
                  onChange={(event) =>
                    setWorkType(event.target.value as "solo" | "shift")
                  }
                  className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="solo">혼자 근무</option>
                  <option value="shift">교대 근무</option>
                </select>
              </Field>
              <Field label="근무자 이름">
                <div className="flex gap-2">
                  <WorkerNamePicker
                    value={workerName}
                    options={workersQuery.data ?? []}
                    onChange={setWorkerName}
                  />
                </div>
              </Field>
              <Field label="개인 PIN">
                <input
                  type="password"
                  inputMode="numeric"
                  value={workerPin}
                  disabled={Boolean(editingJournalId)}
                  onChange={(event) =>
                    setWorkerPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100"
                  placeholder="4자리"
                  maxLength={4}
                />
              </Field>
            </div>

            <div className="grid gap-3 border-t border-gray-200 pt-4 sm:grid-cols-3">
              <Field label="출근 시간">
                <NumberTimeInput
                  value={startTime}
                  onChange={setStartTime}
                  label="출근 시간"
                />
              </Field>
              <Field label="퇴근 시간">
                <NumberTimeInput
                  value={endTime}
                  onChange={setEndTime}
                  label="퇴근 시간"
                />
              </Field>
              <Field label="근무시간">
                <div className="relative">
                  <input
                    type="number"
                    min="0.25"
                    max="24"
                    step="0.25"
                    value={workHours}
                    onChange={(event) => setWorkHours(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-9 text-right text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    시간
                  </span>
                </div>
              </Field>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-200 pt-4">
              <Field label="특이사항">
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  placeholder="특이사항이 없으면 비워두세요"
                />
              </Field>
              <div className="flex justify-end gap-2">
                {editingJournalId && (
                  <Button type="button" variant="gray" onClick={resetWorkForm}>
                    수정 취소
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "저장 중..."
                    : editingJournalId
                      ? "수정 저장"
                      : "근무 기록 추가"}
                </Button>
              </div>
            </div>
          </form>
        </section>
      )}

      {activeTab === "records" && showWorkForm && (
        <AttendanceRecordModal
          workerNames={workersQuery.data ?? []}
          isAdmin={isAdmin}
          editingJournal={
            editingJournalId
              ? journalsQuery.data?.find(
                  (journal) => journal.id === editingJournalId,
                ) ?? null
              : null
          }
          onClose={() => {
            setShowWorkForm(false);
            resetWorkForm();
          }}
          onSaved={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: workJournalKeys.all() }),
              queryClient.invalidateQueries({
                queryKey: workJournalKeys.workers(),
              }),
            ]);
          }}
        />
      )}

      {activeTab === "records" && (
        <section className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
          {!verifiedWorkerName ? (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
              <p className="text-sm font-medium text-gray-500">
                근무자를 선택해 주세요.
              </p>
            </div>
          ) : (
            <>
          {viewMode === "range" && startDate > endDate && (
            <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              종료 날짜는 시작 날짜보다 빠를 수 없습니다.
            </p>
          )}

          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <SummaryCard
              label="총 근무시간"
              value={formatHours(summary.totalHours)}
            />
            <SummaryCard
              label="출근 횟수"
              value={`${summary.attendanceCount}회`}
            />
          </div>

          {journalsQuery.isPending ? (
            <Loading size="sm" text="근무 기록을 불러오는 중..." />
          ) : journalsQuery.data?.length ? (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[1240px] border-collapse text-sm [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-brand-200">
                <thead className="bg-brand-50 text-left text-xs text-brand-700">
                  <tr>
                    <th className="px-3 py-2.5">근무 날짜</th>
                    <th className="px-3 py-2.5">근무자 이름</th>
                    <th className="px-3 py-2.5">근무 상태</th>
                    <th className="px-3 py-2.5">실제 출근</th>
                    <th className="px-3 py-2.5">실제 퇴근</th>
                    <th className="px-3 py-2.5 text-right">실제 근무시간</th>
                    <th className="px-3 py-2.5">입력 출근</th>
                    <th className="px-3 py-2.5">예상 퇴근</th>
                    <th className="px-3 py-2.5 text-right">입력 근무시간</th>
                    <th className="px-3 py-2.5">특이사항</th>
                    <th className="px-3 py-2.5 text-center">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {journalsQuery.data.map((journal) => (
                    <tr key={journal.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {formatKoreanDate(journal.work_date)}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        {journal.worker_name}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            journal.status === "handover_pending"
                              ? "bg-amber-100 text-amber-700"
                              : journal.status === "shift_completed"
                                ? "bg-blue-100 text-blue-700"
                                : journal.status === "closed"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-brand-100 text-brand-700"
                          }`}
                        >
                          {getWorkStatusLabel(journal.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {new Intl.DateTimeFormat("en-GB", {
                          timeZone: "Asia/Seoul",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        }).format(new Date(journal.created_at))}
                      </td>
                      <td className="px-3 py-2.5">
                        {isWorkEnded(journal.status)
                          ? journal.end_time.slice(0, 5)
                          : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">
                        {isWorkEnded(journal.status)
                          ? formatHours(Number(journal.work_hours))
                          : "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        {journal.start_time.slice(0, 5)}
                      </td>
                      <td className="px-3 py-2.5">
                        {journal.expected_end_time?.slice(0, 5) ||
                          journal.end_time.slice(0, 5)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-brand-700">
                        {Number(journal.input_work_hours ?? 0) > 0
                          ? formatHours(Number(journal.input_work_hours))
                          : "-"}
                      </td>
                      <td className="max-w-xs px-3 py-2.5">
                        <p className="truncate" title={journal.note ?? ""}>
                          {journal.note || "-"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex justify-center gap-1">
                          {isAdmin &&
                            journal.status === "handover_pending" && (
                              <Button
                                size="xs"
                                variant="secondary"
                                disabled={closeHandoverMutation.isPending}
                                onClick={() => {
                                  const reason = window.prompt(
                                    "교대 없이 종료하는 사유를 입력해 주세요.",
                                  );
                                  if (!reason?.trim()) return;
                                  closeHandoverMutation.mutate({
                                    id: journal.id,
                                    reason,
                                  });
                                }}
                              >
                                교대 없이 종료
                              </Button>
                            )}
                          <Button
                            size="xs"
                            variant="gray"
                            onClick={() => handleStartEditing(journal)}
                          >
                            수정
                          </Button>
                          {isAdmin && (
                            <Button
                              size="xs"
                              variant="danger"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "이 근무 기록을 삭제하시겠습니까?",
                                  )
                                ) {
                                  deleteMutation.mutate(journal.id);
                                }
                              }}
                            >
                              삭제
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-gray-500">
              선택한 조건의 근무 기록이 없습니다.
            </p>
          )}
            </>
          )}
        </section>
      )}

      {isAdmin && activeTab === "payment" && (
        <>
          <div className="flex flex-col justify-end gap-2 sm:flex-row">
            <input
              type="month"
              value={paymentMonth}
              onChange={(event) => setPaymentMonth(event.target.value)}
              className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
            <select
              value={paymentWorkerFilter}
              onChange={(event) => setPaymentWorkerFilter(event.target.value)}
              className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="">전체 근무자</option>
              {workersQuery.data?.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

        <section className="space-y-5 rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
          {paymentQuery.isPending ? (
            <Loading size="sm" text="급여 지급 현황을 불러오는 중..." />
          ) : paymentGroups.length ? (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                {paymentGroups.map((group) => {
                  const totalHours = group.journals.reduce(
                    (sum, journal) => sum + getPayableHours(journal),
                    0,
                  );
                  const totalActualHours = group.journals.reduce(
                    (sum, journal) => sum + Number(journal.work_hours),
                    0,
                  );
                  const unpaidHours = group.unpaid.reduce(
                    (sum, journal) => sum + getPayableHours(journal),
                    0,
                  );
                  const advanceHours = group.advance.reduce(
                    (sum, journal) => sum + getPayableHours(journal),
                    0,
                  );
                  const salaryHours = group.salary.reduce(
                    (sum, journal) => sum + getPayableHours(journal),
                    0,
                  );
                  return (
                    <div
                      key={group.workerName}
                      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {group.workerName}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            총 근무 {group.journals.length}회 ·{" "}
                            입력 {formatHours(totalHours)} · 실제{" "}
                            {formatHours(totalActualHours)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-brand-700">
                            잔여 지급 {group.unpaid.length}회 ·{" "}
                            {formatHours(unpaidHours)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={
                              paymentMutation.isPending || !group.unpaid.length
                            }
                            onClick={() => handleWorkerSalaryPayment(group)}
                          >
                            {group.unpaid.length
                              ? `월급 지급 (${group.unpaid.length}건)`
                              : "지급 처리 완료"}
                          </Button>
                          {group.salary.length > 0 && (
                            <Button
                              size="sm"
                              variant="gray"
                              disabled={paymentMutation.isPending}
                              onClick={() => handleWorkerSalaryCancel(group)}
                            >
                              월급 지급 취소
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-white px-2 py-2 text-gray-600">
                          <span className="block">미지급</span>
                          <strong className="mt-1 block text-gray-900">
                            {group.unpaid.length}회 · {formatHours(unpaidHours)}
                          </strong>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-2 py-2 text-amber-700">
                          <span className="block">선지급</span>
                          <strong className="mt-1 block">
                            {group.advance.length}회 ·{" "}
                            {formatHours(advanceHours)}
                          </strong>
                        </div>
                        <div className="rounded-lg bg-emerald-50 px-2 py-2 text-emerald-700">
                          <span className="block">월급 지급 완료</span>
                          <strong className="mt-1 block">
                            {group.salary.length}회 · {formatHours(salaryHours)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[900px] border-collapse text-sm [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-brand-200">
                  <thead className="bg-brand-50 text-left text-xs text-brand-700">
                    <tr>
                      <th className="px-3 py-2.5">근무 날짜</th>
                      <th className="px-3 py-2.5">근무자</th>
                      <th className="px-3 py-2.5 text-right">실제 근무시간</th>
                      <th className="px-3 py-2.5 text-right">입력 근무시간</th>
                      <th className="px-3 py-2.5 text-center">지급 상태</th>
                      <th className="px-3 py-2.5">처리 시간</th>
                      <th className="px-3 py-2.5 text-center">선지급</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paymentQuery.data?.map((journal) => {
                      const status = journal.payment_status ?? "unpaid";
                      return (
                        <tr key={journal.id} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {formatKoreanDate(journal.work_date)}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-gray-900">
                            {journal.worker_name}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {formatHours(Number(journal.work_hours))}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-brand-700">
                            {formatHours(getPayableHours(journal))}
                            {journal.input_work_hours == null && (
                              <span className="ml-1 block text-[10px] font-normal text-amber-600">
                                실제시간 대체
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                status === "advance"
                                  ? "bg-amber-100 text-amber-700"
                                  : status === "salary"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {status === "advance"
                                ? "선지급"
                                : status === "salary"
                                  ? "월급 지급"
                                  : "미지급"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">
                            {journal.paid_at
                              ? new Date(journal.paid_at).toLocaleString(
                                  "ko-KR",
                                )
                              : "-"}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {status === "salary" ? (
                              <span className="text-xs text-gray-400">
                                월급 지급 완료
                              </span>
                            ) : (
                              <Button
                                size="xs"
                                variant={
                                  status === "advance" ? "gray" : undefined
                                }
                                disabled={paymentMutation.isPending}
                                onClick={() => handleAdvanceToggle(journal)}
                              >
                                {status === "advance"
                                  ? "선지급 취소"
                                  : "선지급 처리"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-gray-500">
              선택한 월의 근무 기록이 없습니다.
            </p>
          )}
        </section>
        </>
      )}
    </main>
  );
}

const Field = ({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <div className={`block ${className}`}>
    <span className="mb-1 block text-xs font-medium text-gray-600">
      {label}
    </span>
    {children}
  </div>
);

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-4">
    <p className="text-xs font-medium text-brand-600">{label}</p>
    <p className="mt-2 text-xl font-bold text-gray-900">{value}</p>
  </div>
);

const NumberTimeInput = ({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) => {
  const [hour24Text = "", minuteText = ""] = value.split(":");
  const displayHour = value ? String(Number(hour24Text)) : "";
  const displayMinute = value ? String(Number(minuteText)) : "";

  const buildTime = (nextHour: number, nextMinute: number) => {
    const normalizedHour = Math.min(23, Math.max(0, nextHour));
    const normalizedMinute = Math.min(59, Math.max(0, nextMinute));

    onChange(
      `${String(normalizedHour).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`,
    );
  };

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
      <input
        type="number"
        min="0"
        max="23"
        value={displayHour}
        onChange={(event) => {
          if (!event.target.value) {
            onChange("");
            return;
          }
          buildTime(Number(event.target.value), Number(displayMinute || 0));
        }}
        aria-label={`${label} 시`}
        className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-center text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        placeholder="시"
      />
      <span className="text-sm font-medium text-gray-400">:</span>
      <input
        type="number"
        min="0"
        max="59"
        value={displayMinute}
        onChange={(event) =>
          buildTime(Number(displayHour || 0), Number(event.target.value || 0))
        }
        aria-label={`${label} 분`}
        className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-center text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        placeholder="분"
      />
    </div>
  );
};

const WorkerNamePicker = ({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [isOpen]);

  return (
    <div
      ref={pickerRef}
      className="relative min-w-0 flex-1"
      onMouseEnter={() => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        setIsOpen(true);
      }}
      onMouseLeave={() => {
        closeTimerRef.current = setTimeout(() => setIsOpen(false), 180);
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm outline-none hover:border-brand-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>
          {value || "근무자 선택"}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="m6 9 6 6 6-6"
          />
        </svg>
      </button>
      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl"
        >
          {options.length ? (
            options.map((name) => (
              <button
                type="button"
                role="option"
                aria-selected={value === name}
                key={name}
                onClick={() => {
                  onChange(name);
                  setIsOpen(false);
                }}
                className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium text-gray-800 hover:bg-brand-50"
              >
                {name}
                {value === name && (
                  <span className="font-bold text-brand-500">✓</span>
                )}
              </button>
            ))
          ) : (
            <p className="px-3 py-4 text-center text-sm text-gray-400">
              등록된 근무자가 없습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const KoreanDatePicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const getMonthFromValue = () => {
    const date = value ? new Date(`${value}T00:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  };

  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [visibleMonth, setVisibleMonth] = useState(getMonthFromValue);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectDate = (day: number) => {
    const selectedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(selectedDate);
    setIsOpen(false);
  };

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setVisibleMonth(getMonthFromValue());
          setIsOpen((previous) => !previous);
        }}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm outline-none hover:border-brand-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <span className={value ? "text-gray-800" : "text-gray-400"}>
          {value ? formatKoreanDate(value) : "근무 날짜를 선택하세요"}
        </span>
        <svg
          className="h-4 w-4 shrink-0 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[300px] rounded-xl border border-brand-100 bg-white p-3 shadow-xl">
          <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-center">
            <p className="text-xs text-brand-500">선택한 근무 날짜</p>
            <p className="mt-0.5 text-sm font-semibold text-brand-700">
              {value ? formatKoreanDate(value) : "날짜를 선택하세요"}
            </p>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
              className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
              aria-label="이전 달"
            >
              ‹
            </button>
            <strong className="text-sm text-gray-800">
              {year}년 {month + 1}월
            </strong>
            <button
              type="button"
              onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
              className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 text-center">
            {weekdays.map((weekday, index) => (
              <span
                key={weekday}
                className={`py-1 text-[11px] font-medium ${
                  index === 0
                    ? "text-rose-500"
                    : index === 6
                      ? "text-blue-500"
                      : "text-gray-500"
                }`}
              >
                {weekday}
              </span>
            ))}
            {calendarCells.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} />;
              const dateValue = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = dateValue === value;
              const now = new Date();
              const todayValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
              const isToday = dateValue === todayValue;
              const weekdayIndex = index % 7;
              return (
                <button
                  key={dateValue}
                  type="button"
                  aria-label={`${day}일${isToday ? " 오늘" : ""}`}
                  onClick={() => selectDate(day)}
                  className={`mx-auto my-0.5 flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors ${
                    isSelected
                      ? "bg-brand-500 font-semibold text-white"
                      : isToday
                        ? "border-2 border-brand-400 bg-brand-50 font-bold text-brand-700"
                        : weekdayIndex === 0
                          ? "text-rose-500 hover:bg-rose-50"
                          : weekdayIndex === 6
                            ? "text-blue-500 hover:bg-blue-50"
                            : "text-gray-700 hover:bg-brand-50"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
