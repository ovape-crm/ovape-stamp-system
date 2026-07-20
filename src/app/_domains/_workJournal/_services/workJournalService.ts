import supabase from '@/libs/supabaseClient';
import {
  WorkJournalType,
  WorkerDetailType,
} from '../_types/workJournal.types';

const getNextMonth = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const getWorkJournals = async (
  month: string,
  workerName = '',
): Promise<WorkJournalType[]> => {
  let query = supabase
    .from('work_journals')
    .select('*')
    .gte('work_date', `${month}-01`)
    .lt('work_date', `${getNextMonth(month)}-01`);

  if (workerName) query = query.eq('worker_name', workerName);

  const { data, error } = await query
    .order('work_date', { ascending: false })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkJournalType[];
};

export const getWorkJournalsByRange = async (
  startDate: string,
  endDate: string,
  workerName = '',
): Promise<WorkJournalType[]> => {
  let query = supabase
    .from('work_journals')
    .select('*')
    .gte('work_date', startDate)
    .lte('work_date', endDate);

  if (workerName) query = query.eq('worker_name', workerName);

  const { data, error } = await query
    .order('work_date', { ascending: false })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkJournalType[];
};

export const getWorkJournalsByDate = async (
  date: string,
): Promise<WorkJournalType[]> => {
  const { data, error } = await supabase
    .from('work_journals')
    .select('*')
    .eq('work_date', date)
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkJournalType[];
};

export const getWorkerNames = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('work_journal_workers')
    .select('name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.name);
};

export const getWorkerDetails = async (): Promise<WorkerDetailType[]> => {
  const { data: workers, error: workersError } = await supabase
    .from('work_journal_workers')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (workersError) throw workersError;

  const { data: privateDetails, error: detailsError } = await supabase
    .from('work_journal_worker_private')
    .select('worker_id, phone_number, bank_account, first_work_date, note');

  if (detailsError) throw detailsError;
  const detailByWorkerId = new Map(
    (privateDetails ?? []).map((detail) => [detail.worker_id, detail]),
  );

  return (workers ?? []).map((worker) => {
    const detail = detailByWorkerId.get(worker.id);
    return {
      ...worker,
      phone_number: detail?.phone_number ?? '',
      bank_account: detail?.bank_account ?? '',
      first_work_date: detail?.first_work_date ?? '',
      note: detail?.note ?? null,
    };
  });
};

export const createWorker = async (values: {
  name: string;
  phoneNumber: string;
  bankAccount: string;
  firstWorkDate: string;
  note: string;
}): Promise<void> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) throw new Error('세션을 찾을 수 없습니다.');

  const { data: worker, error } = await supabase
    .from('work_journal_workers')
    .insert({
      name: values.name.trim(),
      created_by: session.user.id,
    })
    .select('id')
    .single();

  if (error) throw error;

  const { error: privateError } = await supabase
    .from('work_journal_worker_private')
    .insert({
      worker_id: worker.id,
      phone_number: values.phoneNumber.trim(),
      bank_account: values.bankAccount.trim(),
      first_work_date: values.firstWorkDate,
      note: values.note.trim() || null,
    });

  if (privateError) {
    await supabase.from('work_journal_workers').delete().eq('id', worker.id);
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
  },
): Promise<void> => {
  const { error } = await supabase
    .from('work_journal_worker_private')
    .upsert(
      {
        worker_id: workerId,
        phone_number: values.phoneNumber.trim(),
        bank_account: values.bankAccount.trim(),
        first_work_date: values.firstWorkDate,
        note: values.note.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'worker_id' },
    );

  if (error) throw error;
};

export const deactivateWorker = async (name: string): Promise<void> => {
  const { error } = await supabase
    .from('work_journal_workers')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('name', name);

  if (error) throw error;
};

export const createWorkJournal = async (values: {
  workDate: string;
  workerName: string;
  startTime: string;
  endTime: string;
  workHours: number;
  note: string;
}): Promise<void> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) throw new Error('세션을 찾을 수 없습니다.');

  const { error } = await supabase.from('work_journals').insert({
    work_date: values.workDate,
    worker_name: values.workerName.trim(),
    start_time: values.startTime,
    end_time: values.endTime,
    work_hours: values.workHours,
    note: values.note.trim() || null,
    created_by: session.user.id,
  });

  if (error) throw error;
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
  },
): Promise<void> => {
  const { error } = await supabase
    .from('work_journals')
    .update({
      work_date: values.workDate,
      worker_name: values.workerName.trim(),
      start_time: values.startTime,
      end_time: values.endTime,
      work_hours: values.workHours,
      note: values.note.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
};

export const deleteWorkJournal = async (id: string): Promise<void> => {
  const { error } = await supabase.from('work_journals').delete().eq('id', id);
  if (error) throw error;
};
