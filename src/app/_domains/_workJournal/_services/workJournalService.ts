import supabase from "@/libs/supabaseClient";
import {
  WorkJournalType,
  WorkPaymentStatus,
  WorkerDetailType,
} from "../_types/workJournal.types";

const getNextMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const getWorkJournals = async (
  month: string,
  workerName = "",
): Promise<WorkJournalType[]> => {
  let query = supabase
    .from("work_journals")
    .select("*")
    .gte("work_date", `${month}-01`)
    .lt("work_date", `${getNextMonth(month)}-01`);

  if (workerName) query = query.eq("worker_name", workerName);

  const { data, error } = await query
    .order("work_date", { ascending: false })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkJournalType[];
};

export const getWorkJournalsByRange = async (
  startDate: string,
  endDate: string,
  workerName = "",
): Promise<WorkJournalType[]> => {
  let query = supabase
    .from("work_journals")
    .select("*")
    .gte("work_date", startDate)
    .lte("work_date", endDate);

  if (workerName) query = query.eq("worker_name", workerName);

  const { data, error } = await query
    .order("work_date", { ascending: false })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkJournalType[];
};

export const getWorkJournalsByDate = async (
  date: string,
): Promise<WorkJournalType[]> => {
  const { data, error } = await supabase
    .from("work_journals")
    .select("*")
    .eq("work_date", date)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkJournalType[];
};

export const getWorkerNames = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from("work_journal_workers")
    .select("name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.name);
};

export const getWorkerDetails = async (): Promise<WorkerDetailType[]> => {
  const { data: workers, error: workersError } = await supabase
    .from("work_journal_workers")
    .select("id, name, is_active, is_payroll_eligible")
    .order("name", { ascending: true });

  if (workersError) throw workersError;

  const { data: privateDetails, error: detailsError } = await supabase
    .from("work_journal_worker_private")
    .select(
      "worker_id, phone_number, bank_account, first_work_date, note, pin_hash, pin_code",
    );

  if (detailsError) throw detailsError;
  const detailByWorkerId = new Map(
    (privateDetails ?? []).map((detail) => [detail.worker_id, detail]),
  );

  return (workers ?? []).map((worker) => {
    const detail = detailByWorkerId.get(worker.id);
    return {
      ...worker,
      phone_number: detail?.phone_number ?? "",
      bank_account: detail?.bank_account ?? "",
      first_work_date: detail?.first_work_date ?? "",
      note: detail?.note ?? null,
      has_pin: Boolean(detail?.pin_hash),
      pin_code: detail?.pin_code ?? "",
    };
  });
};

export const createWorker = async (values: {
  name: string;
  phoneNumber: string;
  bankAccount: string;
  firstWorkDate: string;
  note: string;
  pin: string;
  isActive: boolean;
  isPayrollEligible: boolean;
}): Promise<void> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) throw new Error("세션을 찾을 수 없습니다.");

  const { data: worker, error } = await supabase
    .from("work_journal_workers")
    .insert({
      name: values.name.trim(),
      is_active: values.isActive,
      is_payroll_eligible: values.isPayrollEligible,
      created_by: session.user.id,
    })
    .select("id")
    .single();

  if (error) throw error;

  const { error: privateError } = await supabase
    .from("work_journal_worker_private")
    .insert({
      worker_id: worker.id,
      phone_number: values.phoneNumber.trim(),
      bank_account: values.bankAccount.trim(),
      first_work_date: values.firstWorkDate,
      note: values.note.trim() || null,
      pin_hash: values.pin ? values.pin : null,
      pin_code: values.pin ? values.pin : null,
    });

  if (privateError) {
    await supabase.from("work_journal_workers").delete().eq("id", worker.id);
    throw privateError;
  }
};

export const updateWorkerDetails = async (
  workerId: string,
  values: {
    phoneNumber: string;
    bankAccount: string;
    firstWorkDate: string;
    note: string;
    pin: string;
    isActive: boolean;
    isPayrollEligible: boolean;
  },
): Promise<void> => {
  const { error: workerError } = await supabase
    .from("work_journal_workers")
    .update({
      is_active: values.isActive,
      is_payroll_eligible: values.isPayrollEligible,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workerId);

  if (workerError) throw workerError;

  const { error } = await supabase.from("work_journal_worker_private").upsert(
    {
      worker_id: workerId,
      phone_number: values.phoneNumber.trim(),
      bank_account: values.bankAccount.trim(),
      first_work_date: values.firstWorkDate,
      note: values.note.trim() || null,
      ...(values.pin ? { pin_hash: values.pin, pin_code: values.pin } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "worker_id" },
  );

  if (error) throw error;
};

export const deactivateWorker = async (name: string): Promise<void> => {
  const { error } = await supabase
    .from("work_journal_workers")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("name", name);

  if (error) throw error;
};

export const createWorkJournal = async (values: {
  workDate: string;
  workerName: string;
  startTime: string;
  endTime: string;
  workHours: number;
  note: string;
  startType: "solo" | "first" | "handover";
  pin: string;
}): Promise<void> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) throw new Error("세션을 찾을 수 없습니다.");

  const { data: verified, error: verifyError } = await supabase.rpc(
    "verify_work_journal_worker_pin",
    { p_worker_name: values.workerName.trim(), p_pin: values.pin },
  );
  if (verifyError) throw verifyError;
  if (!verified) throw new Error("INVALID_WORKER_PIN");

  const normalizedWorkerName = values.workerName.trim();
  const { data: otherJournals, error: otherJournalsError } = await supabase
    .from("work_journals")
    .select("id, work_type")
    .eq("work_date", values.workDate)
    .neq("worker_name", normalizedWorkerName);

  if (otherJournalsError) throw otherJournalsError;

  const hasSoloWorker = (otherJournals ?? []).some(
    (journal) => journal.work_type === "solo",
  );
  const hasFirstShiftWorker = (otherJournals ?? []).some(
    (journal) => journal.work_type === "shift",
  );
  if (hasSoloWorker) throw new Error("SOLO_WORK_DAY_LOCKED");
  if (hasFirstShiftWorker && values.startType !== "handover") {
    throw new Error("HANDOVER_WORKER_REQUIRED");
  }
  if (!hasFirstShiftWorker && values.startType === "handover") {
    throw new Error("HANDOVER_WORKER_REQUIRED");
  }

  const { data: pendingHandover, error: pendingError } = await supabase
    .from("work_journals")
    .select("id")
    .eq("work_date", values.workDate)
    .eq("status", "handover_pending")
    .neq("worker_name", normalizedWorkerName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingError) throw pendingError;

  const { data: createdJournal, error } = await supabase
    .from("work_journals")
    .insert({
      work_date: values.workDate,
      worker_name: normalizedWorkerName,
      start_time: values.startTime,
      end_time: values.endTime,
      expected_end_time: values.endTime,
      work_hours: values.workHours,
      note: values.note.trim() || null,
      work_type: values.startType === "first" ? "shift" : "solo",
      status: "working",
      created_by: session.user.id,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (pendingHandover) {
    const { error: handoverError } = await supabase
      .from("work_journals")
      .update({
        status: "shift_completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pendingHandover.id)
      .eq("status", "handover_pending");

    if (handoverError) {
      await supabase.from("work_journals").delete().eq("id", createdJournal.id);
      throw handoverError;
    }
  }

  window.localStorage.setItem(
    "current-work-worker",
    JSON.stringify({ name: normalizedWorkerName, workDate: values.workDate }),
  );
  window.dispatchEvent(new Event("staff-opening-changed"));
};

export const completeWorkJournal = async (values: {
  journalId: string;
  workerName: string;
  pin: string;
  actualEndTime: string;
  inputEndTime: string;
  workHours: number;
  inputWorkHours: number;
  note: string;
  workType: "solo" | "shift";
}): Promise<"handover_pending" | "shift_completed" | "closed"> => {
  const { data: verified, error: verifyError } = await supabase.rpc(
    "verify_work_journal_worker_pin",
    { p_worker_name: values.workerName.trim(), p_pin: values.pin },
  );
  if (verifyError) throw verifyError;
  if (!verified) throw new Error("INVALID_WORKER_PIN");

  let completionStatus: "handover_pending" | "shift_completed" | "closed" =
    "closed";

  if (values.workType === "shift") {
    const { data: currentJournal, error: currentJournalError } = await supabase
      .from("work_journals")
      .select("work_date, created_at")
      .eq("id", values.journalId)
      .eq("worker_name", values.workerName.trim())
      .single();

    if (currentJournalError) throw currentJournalError;

    const { data: successor, error: successorError } = await supabase
      .from("work_journals")
      .select("id")
      .eq("work_date", currentJournal.work_date)
      .neq("worker_name", values.workerName.trim())
      .gt("created_at", currentJournal.created_at)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (successorError) throw successorError;
    completionStatus = successor ? "shift_completed" : "handover_pending";
  }

  const { error } = await supabase
    .from("work_journals")
    .update({
      end_time: values.actualEndTime,
      expected_end_time: values.inputEndTime,
      work_hours: values.workHours,
      input_work_hours: values.inputWorkHours,
      note: values.note.trim() || null,
      status: completionStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.journalId)
    .eq("worker_name", values.workerName.trim());

  if (error) throw error;
  window.localStorage.removeItem("current-work-worker");
  return completionStatus;
};

export const closeHandoverWithoutSuccessor = async (
  journalId: string,
  reason: string,
): Promise<void> => {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("HANDOVER_CLOSE_REASON_REQUIRED");

  const { data: journal, error: findError } = await supabase
    .from("work_journals")
    .select("note")
    .eq("id", journalId)
    .eq("status", "handover_pending")
    .single();

  if (findError) throw findError;

  const closeNote = `[교대 없이 종료] ${normalizedReason}`;
  const { error } = await supabase
    .from("work_journals")
    .update({
      status: "closed",
      note: [journal.note, closeNote].filter(Boolean).join("\n"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", journalId)
    .eq("status", "handover_pending");

  if (error) throw error;
};

export const updateAttendanceJournal = async (
  journalId: string,
  values: {
    workDate: string;
    workerName: string;
    startTime: string;
    expectedEndTime: string;
    actualEndTime: string;
    workHours: number;
    inputWorkHours: number | null;
    note: string;
    workType: "solo" | "shift";
    status: "working" | "handover_pending" | "shift_completed" | "closed";
    actualStartTime?: string;
  },
): Promise<void> => {
  const { error } = await supabase
    .from("work_journals")
    .update({
      work_date: values.workDate,
      worker_name: values.workerName.trim(),
      start_time: values.startTime,
      expected_end_time: values.expectedEndTime,
      end_time:
        values.status !== "working"
          ? values.actualEndTime
          : values.expectedEndTime,
      work_hours: values.workHours,
      input_work_hours: values.inputWorkHours,
      note: values.note.trim() || null,
      work_type: values.workType,
      status: values.status,
      ...(values.actualStartTime
        ? {
            created_at: new Date(
              `${values.workDate}T${values.actualStartTime}:00+09:00`,
            ).toISOString(),
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", journalId);

  if (error) throw error;
};

export const verifyWorkerPin = async (
  workerName: string,
  pin: string,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc("verify_work_journal_worker_pin", {
    p_worker_name: workerName.trim(),
    p_pin: pin,
  });
  if (error) throw error;
  return Boolean(data);
};

export const updateWorkJournal = async (
  id: string,
  values: {
    workDate: string;
    workerName: string;
    startTime: string;
    endTime: string;
    workHours: number;
    note: string;
    workType: "solo" | "shift";
  },
): Promise<void> => {
  const { error } = await supabase
    .from("work_journals")
    .update({
      work_date: values.workDate,
      worker_name: values.workerName.trim(),
      start_time: values.startTime,
      end_time: values.endTime,
      expected_end_time: values.endTime,
      work_hours: values.workHours,
      note: values.note.trim() || null,
      work_type: values.workType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
};

export const deleteWorkJournal = async (id: string): Promise<void> => {
  const { error } = await supabase.from("work_journals").delete().eq("id", id);
  if (error) throw error;
};

export const updateWorkJournalPaymentStatus = async (
  journalIds: string[],
  status: WorkPaymentStatus,
  fromStatus?: WorkPaymentStatus,
): Promise<void> => {
  if (!journalIds.length) return;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) throw new Error("세션을 찾을 수 없습니다.");

  const isPaid = status !== "unpaid";
  let query = supabase
    .from("work_journals")
    .update({
      payment_status: status,
      paid_at: isPaid ? new Date().toISOString() : null,
      paid_by: isPaid ? session.user.id : null,
      updated_at: new Date().toISOString(),
    })
    .in("id", journalIds);

  if (fromStatus) query = query.eq("payment_status", fromStatus);

  const { error } = await query;

  if (error) throw error;
};

export const processWorkJournalPayroll = async (values: {
  journalIds: string[];
  kind: "advance" | "salary";
  hourlyRate: number;
  mealAllowance: number;
  paidOn: string;
}) => {
  const { data, error } = await supabase.rpc("process_work_journal_payroll", {
    p_journal_ids: values.journalIds,
    p_kind: values.kind,
    p_hourly_rate: values.hourlyRate,
    p_meal_allowance: values.mealAllowance,
    p_paid_on: values.paidOn,
  });
  if (error) throw error;
  return (data ?? [])[0] as { batch_id: string; amount: number; memo: string };
};

export const cancelWorkJournalPayroll = async (batchIds: string[]) => {
  const { data, error } = await supabase.rpc("cancel_work_journal_payroll", {
    p_batch_ids: batchIds,
  });
  if (error) throw error;
  return data as number;
};
