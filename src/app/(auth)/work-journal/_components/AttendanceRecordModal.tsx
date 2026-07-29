"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import KoreanDatePicker from "@/app/_components/KoreanDatePicker";
import { Dropdown, DropdownOption } from "@/app/_components/Dropdown";
import {
  completeWorkJournal,
  createWorkJournal,
  getWorkJournalsByDate,
  updateAttendanceJournal,
  verifyWorkerPin,
} from "@/app/_domains/_workJournal/_services/workJournalService";
import type { WorkJournalType } from "@/app/_domains/_workJournal/_types/workJournal.types";

const getTodayInKorea = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const getCurrentTimeInKorea = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

const getCreatedTimeInKorea = (createdAt?: string) => {
  if (!createdAt) return getCurrentTimeInKorea();
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const calculateHours = (start: string, end: string) => {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
};

export default function AttendanceRecordModal({
  workerNames,
  isAdmin,
  editingJournal,
  onClose,
  onSaved,
}: {
  workerNames: string[];
  isAdmin: boolean;
  editingJournal?: WorkJournalType | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const today = getTodayInKorea();
  const isEditing = Boolean(editingJournal);
  const isPastJournal = Boolean(
    editingJournal && editingJournal.work_date < today,
  );
  const initialMode =
    editingJournal &&
    (editingJournal.status !== "working" || isPastJournal)
      ? "end"
      : editingJournal
        ? "start"
        : "";
  const [step, setStep] = useState<1 | 2>(editingJournal ? 2 : 1);
  const [workDate, setWorkDate] = useState(
    editingJournal?.work_date ?? today,
  );
  const [workerName, setWorkerName] = useState(
    editingJournal?.worker_name ?? "",
  );
  const [pin, setPin] = useState("");
  const [verified, setVerified] = useState(Boolean(editingJournal));
  const [mode, setMode] = useState<"start" | "end" | "">(initialMode);
  const [startTime, setStartTime] = useState(
    editingJournal?.start_time.slice(0, 5) ?? getCurrentTimeInKorea(),
  );
  const [actualStartTime, setActualStartTime] = useState(() =>
    getCreatedTimeInKorea(editingJournal?.created_at),
  );
  const [expectedEndTime, setExpectedEndTime] = useState(
    editingJournal?.expected_end_time?.slice(0, 5) ??
      editingJournal?.end_time.slice(0, 5) ??
      "22:00",
  );
  const [actualEndTime, setActualEndTime] = useState(
    editingJournal?.end_time.slice(0, 5) ?? getCurrentTimeInKorea(),
  );
  const [workType, setWorkType] = useState<"solo" | "shift">(
    editingJournal?.work_type ?? "solo",
  );
  const [note, setNote] = useState(editingJournal?.note ?? "");
  const initialInputWorkHours = Number(editingJournal?.input_work_hours ?? 0);
  const [inputWorkHours, setInputWorkHours] = useState(
    initialInputWorkHours > 0 ? String(initialInputWorkHours) : "",
  );
  const [verifying, setVerifying] = useState(false);

  const journalsQuery = useQuery({
    queryKey: ["attendance-record-date", workDate],
    queryFn: () => getWorkJournalsByDate(workDate),
  });
  const selectedJournal = useMemo(
    () =>
      journalsQuery.data?.find(
        (journal) => journal.worker_name === workerName,
      ),
    [journalsQuery.data, workerName],
  );
  const previousJournal = useMemo(
    () =>
      [...(journalsQuery.data ?? [])]
        .filter((journal) => journal.worker_name !== workerName)
        .sort((a, b) => b.start_time.localeCompare(a.start_time))[0],
    [journalsQuery.data, workerName],
  );
  const isShiftRequired =
    !editingJournal && previousJournal?.work_type === "shift";
  const openJournal =
    selectedJournal && selectedJournal.status === "working"
      ? selectedJournal
      : null;
  const checkoutJournal = editingJournal ?? openJournal;
  const checkoutHours = checkoutJournal
    ? calculateHours(actualStartTime, actualEndTime)
    : 0;
  const title =
    mode === "start"
      ? isEditing
        ? "출근 기록 수정"
        : "출근 기록 추가"
      : mode === "end"
        ? isEditing
          ? "퇴근 기록 수정"
          : "퇴근 기록 추가"
        : "출근/퇴근 기록 추가";

  const resetVerification = () => {
    setVerified(false);
    setMode("");
    setStep(1);
  };

  const handleVerify = async () => {
    if (!workerName || pin.length !== 4) {
      toast.error("근무자 이름과 개인 PIN 4자리를 입력해 주세요.");
      return;
    }
    if (!isAdmin && workDate !== today) {
      toast.error("스태프 계정은 당일 기록만 추가할 수 있습니다.");
      return;
    }
    setVerifying(true);
    try {
      const result = await verifyWorkerPin(workerName, pin);
      if (!result) {
        toast.error("개인 PIN이 올바르지 않습니다.");
        setVerified(false);
        return;
      }
      setVerified(true);
      toast.success("근무자 확인이 완료되었습니다.");
    } catch {
      toast.error("근무자 확인에 실패했습니다.");
    } finally {
      setVerifying(false);
    }
  };

  const startMutation = useMutation({
    mutationFn: () =>
      createWorkJournal({
        workDate,
        workerName,
        startTime,
        endTime: expectedEndTime,
        workHours: calculateHours(startTime, expectedEndTime),
        note,
        workType,
        pin,
      }),
    onSuccess: async () => {
      toast.success("출근 기록을 추가했습니다.");
      await onSaved();
      onClose();
    },
    onError: (error: { code?: string; message?: string }) => {
      if (error.code === "23505") {
        toast.error("해당 날짜에 이미 근무 기록이 있습니다.");
        return;
      }
      if (error.message === "INVALID_WORKER_PIN") {
        toast.error("개인 PIN이 올바르지 않습니다.");
        return;
      }
      toast.error("출근 기록 추가에 실패했습니다.");
    },
  });

  const endMutation = useMutation({
    mutationFn: (confirmedEndTime: string) => {
      if (!openJournal) throw new Error("WORK_JOURNAL_NOT_FOUND");
      return completeWorkJournal({
        journalId: openJournal.id,
        workerName,
        pin,
        actualEndTime: confirmedEndTime,
        workHours: calculateHours(
          openJournal.start_time.slice(0, 5),
          confirmedEndTime,
        ),
        inputWorkHours: Number(inputWorkHours),
        note: note || openJournal.note || "",
        workType: openJournal.work_type ?? "solo",
      });
    },
    onSuccess: async () => {
      toast.success(
        openJournal?.work_type === "shift"
          ? "퇴근 기록을 저장하고 인수인계 대기로 전환했습니다."
          : "퇴근 기록을 확정했습니다.",
      );
      await onSaved();
      onClose();
    },
    onError: (error: Error) => {
      if (error.message === "INVALID_WORKER_PIN") {
        toast.error("개인 PIN이 올바르지 않습니다.");
        return;
      }
      toast.error("퇴근 기록 처리에 실패했습니다.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingJournal) throw new Error("WORK_JOURNAL_NOT_FOUND");
      const status =
        mode === "start"
          ? "working"
          : editingJournal.status === "handover_pending" ||
              editingJournal.status === "shift_completed"
            ? editingJournal.status
            : "closed";
      return updateAttendanceJournal(editingJournal.id, {
        workDate,
        workerName,
        startTime,
        expectedEndTime,
        actualEndTime,
        workHours:
          status !== "working"
            ? checkoutHours
            : calculateHours(startTime, expectedEndTime),
        inputWorkHours:
          status !== "working" ? Number(inputWorkHours) : null,
        note,
        workType,
        status,
        actualStartTime: isAdmin ? actualStartTime : undefined,
      });
    },
    onSuccess: async () => {
      toast.success("근무 기록을 수정했습니다.");
      await onSaved();
      onClose();
    },
    onError: () => toast.error("근무 기록 수정에 실패했습니다."),
  });

  const selectMode = (nextMode: "start" | "end") => {
    if (!verified) return;
    if (nextMode === "start" && selectedJournal) {
      toast.error("해당 날짜에 이미 근무 기록이 있습니다.");
      return;
    }
    if (nextMode === "end" && !openJournal) {
      toast.error("진행 중인 출근 기록이 없습니다.");
      return;
    }
    setMode(nextMode);
    if (nextMode === "end" && openJournal) {
      setStartTime(openJournal.start_time.slice(0, 5));
      setActualStartTime(getCreatedTimeInKorea(openJournal.created_at));
      setExpectedEndTime(
        openJournal.expected_end_time?.slice(0, 5) ||
          openJournal.end_time.slice(0, 5),
      );
      setWorkType(openJournal.work_type ?? "solo");
      setNote(openJournal.note ?? "");
      const currentTime = getCurrentTimeInKorea();
      setActualEndTime(currentTime);
      setInputWorkHours("");
    }
  };

  const canContinue = verified && Boolean(mode);
  const canConfirmStart = Boolean(startTime && expectedEndTime);
  const canConfirmEnd = Boolean(
    actualEndTime &&
      checkoutHours > 0 &&
      Number.isFinite(Number(inputWorkHours)) &&
      Number(inputWorkHours) > 0 &&
      Number(inputWorkHours) <= 24,
  );

  useEffect(() => {
    if (mode === "start" && isShiftRequired) {
      setWorkType("shift");
    }
  }, [isShiftRequired, mode]);

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-gray-950/50 p-3 sm:p-6">
      <section className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-visible rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-7">
          <h2 className="text-xl font-bold text-gray-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </header>

        <div
          className={`min-h-0 flex-1 px-5 py-5 sm:px-7 ${
            step === 1 ? "overflow-visible" : "overflow-y-auto"
          }`}
        >
          <div className="mx-auto mb-6 flex max-w-xs items-start">
            {(
              [
                { stepNumber: 1, label: "근무자 정보" },
                {
                  stepNumber: 2,
                  label: mode === "end" ? "퇴근 정보" : "출근 정보",
                },
              ] as const
            ).map(({ stepNumber, label }, index) => (
              <div
                key={String(stepNumber)}
                className="flex flex-1 items-start last:flex-none"
              >
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${
                      step >= stepNumber
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-200 bg-gray-100 text-gray-400"
                    }`}
                  >
                    {step > stepNumber ? "✓" : stepNumber}
                  </span>
                  <span
                    className={`whitespace-nowrap text-xs font-semibold ${
                      step >= stepNumber ? "text-brand-600" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {index === 0 && (
                  <span
                    className={`mt-[18px] h-0.5 flex-1 ${
                      step > 1 ? "bg-brand-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <section className="rounded-xl bg-gray-50 p-4">
                <p className="mb-2 text-xs font-bold text-brand-600">
                  근무 날짜
                </p>
                <KoreanDatePicker
                  value={workDate}
                  onChange={(value) => {
                    setWorkDate(value);
                    resetVerification();
                  }}
                  selectedLabel="선택한 근무 날짜"
                />
              </section>

              <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-stretch">
                <div className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:min-w-0 sm:flex-1">
                  <p className="mb-1 text-xs font-semibold text-gray-600">
                    근무자 이름
                  </p>
                  <Dropdown controlledValue={workerName}>
                    <Dropdown.Trigger compact>
                      {workerName || "선택"}
                    </Dropdown.Trigger>
                    <Dropdown.Content compact>
                      {workerNames.map((name) => (
                        <Dropdown.Item
                          key={name}
                          option={{ value: name, label: name }}
                          compact
                          onSelect={(selected: DropdownOption) => {
                            setWorkerName(String(selected.value));
                            setPin("");
                            resetVerification();
                          }}
                        />
                      ))}
                    </Dropdown.Content>
                  </Dropdown>
                </div>
                <div className="hidden w-px shrink-0 self-stretch bg-gray-300 sm:block" />
                <label className="flex w-full flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-2.5 sm:w-[150px] sm:shrink-0">
                  <span className="mb-1 text-xs font-semibold text-gray-600">
                    개인 PIN
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(event) => {
                      setPin(
                        event.target.value.replace(/\D/g, "").slice(0, 4),
                      );
                      resetVerification();
                    }}
                    placeholder="4자리"
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-center text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <div className="hidden w-px shrink-0 self-stretch bg-gray-300 sm:block" />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleVerify}
                  disabled={verifying}
                  className="h-9 min-w-16 self-center px-3"
                >
                  {verifying ? "확인 중" : "조회"}
                </Button>
              </div>

              <section className="border-t border-gray-200 pt-4">
                <p className="mb-2 text-sm font-semibold text-gray-700">
                  출근/퇴근 선택
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!verified}
                    onClick={() => selectMode("start")}
                    className={`h-11 cursor-pointer rounded-lg border font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      mode === "start"
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-300 bg-white text-gray-600 hover:border-brand-300"
                    }`}
                  >
                    출근
                  </button>
                  <button
                    type="button"
                    disabled={!verified}
                    onClick={() => selectMode("end")}
                    className={`h-11 cursor-pointer rounded-lg border font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      mode === "end"
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-300 bg-white text-gray-600 hover:border-brand-300"
                    }`}
                  >
                    퇴근
                  </button>
                </div>
              </section>
            </div>
          ) : mode === "start" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {isAdmin && isEditing ? (
                  <TimeField
                    label="실제 출근시간"
                    value={actualStartTime}
                    onChange={setActualStartTime}
                  />
                ) : (
                  <ReadOnlyField
                    label="실제 출근시간"
                    value={actualStartTime}
                  />
                )}
                <TimeField
                  label="입력 출근시간"
                  value={startTime}
                  onChange={setStartTime}
                />
                <TimeField
                  label="예상 퇴근시간"
                  value={expectedEndTime}
                  onChange={setExpectedEndTime}
                />
              </div>
              <label className="block text-sm font-semibold text-gray-700">
                근무 유형
                <select
                  value={workType}
                  disabled={isShiftRequired}
                  onChange={(event) =>
                    setWorkType(event.target.value as "solo" | "shift")
                  }
                  className="mt-1 h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-700"
                >
                  <option value="solo">혼자 근무</option>
                  <option value="shift">교대 근무</option>
                </select>
                {isShiftRequired && (
                  <span className="mt-1.5 block text-xs font-medium text-brand-600">
                    이전 근무자가 교대 근무로 등록하여 자동으로 고정됩니다.
                  </span>
                )}
              </label>
              <NoteField value={note} onChange={setNote} />
            </div>
          ) : (
            <div className="space-y-4">
              {isAdmin && isEditing && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  관리자 보정 모드입니다. 실제 출근·퇴근시간과 입력
                  근무시간을 수정하면 실제 근무시간이 자동 계산됩니다.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {isAdmin && isEditing ? (
                  <TimeField
                    label="실제 출근시간"
                    value={actualStartTime}
                    onChange={setActualStartTime}
                  />
                ) : (
                  <ReadOnlyField
                    label="실제 출근시간"
                    value={actualStartTime}
                  />
                )}
                <ReadOnlyField
                  label="입력 출근시간"
                  value={startTime}
                />
                <ReadOnlyField
                  label="예상 퇴근시간"
                  value={expectedEndTime}
                />
                {isAdmin && isEditing ? (
                  <TimeField
                    label="실제 퇴근시간"
                    value={actualEndTime}
                    onChange={setActualEndTime}
                  />
                ) : (
                  <ReadOnlyField
                    label="실제 퇴근시간"
                    value={actualEndTime}
                  />
                )}
                <ReadOnlyField
                  label="실제 근무시간"
                  value={`${checkoutHours}시간`}
                />
                <label className="block text-sm font-semibold text-gray-700 sm:col-span-2">
                  입력 근무시간
                  <div className="relative mt-1">
                    <input
                      type="number"
                      min="0.01"
                      max="24"
                      step="0.01"
                      value={inputWorkHours}
                      onChange={(event) =>
                        setInputWorkHours(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 pr-12 text-right outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      시간
                    </span>
                  </div>
                </label>
              </div>
              <NoteField value={note} onChange={setNote} />
              {workType === "shift" && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  교대 근무 퇴근 전에는 시재 확인과 인수인계 내용을 확인해 주세요.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-gray-100 bg-white px-5 py-4 sm:px-7">
          {step === 1 ? (
            <Button variant="gray" onClick={onClose}>
              취소
            </Button>
          ) : (
            <Button variant="gray" onClick={() => setStep(1)}>
              이전
            </Button>
          )}
          {step === 1 ? (
            <Button
              onClick={() => setStep(2)}
              disabled={!canContinue}
            >
              다음
            </Button>
          ) : isEditing ? (
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={
                updateMutation.isPending ||
                (mode === "start" ? !canConfirmStart : !canConfirmEnd)
              }
            >
              {updateMutation.isPending ? "저장 중..." : "수정 저장"}
            </Button>
          ) : mode === "start" ? (
            <Button
              onClick={() => startMutation.mutate()}
              disabled={!canConfirmStart || startMutation.isPending}
            >
              {startMutation.isPending ? "처리 중..." : "출근 확정"}
            </Button>
          ) : (
            <Button
              onClick={() => {
                const confirmedEndTime = getCurrentTimeInKorea();
                setActualEndTime(confirmedEndTime);
                endMutation.mutate(confirmedEndTime);
              }}
              disabled={!canConfirmEnd || endMutation.isPending}
            >
              {endMutation.isPending ? "처리 중..." : "퇴근 확정"}
            </Button>
          )}
        </footer>
      </section>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-semibold text-gray-700">
      {label}
      <input
        type="time"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          const previousMinute = value.split(":")[1] ?? "";
          const nextMinute = nextValue.split(":")[1] ?? "";
          onChange(nextValue);
          if (previousMinute !== nextMinute) {
            event.currentTarget.blur();
          }
        }}
        className="mt-1 h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700">{label}</p>
      <div className="mt-1 flex h-11 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 font-semibold text-gray-800">
        {value || "-"}
      </div>
    </div>
  );
}

function NoteField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-gray-700">
      특이사항
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="특이사항이 없으면 비워두세요"
        className="mt-1 h-24 w-full resize-none rounded-lg border border-gray-300 p-3 font-normal outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}
