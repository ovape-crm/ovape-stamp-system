import supabase from '@/libs/supabaseClient';

export type CurrentWorker = {
  name: string;
  workDate: string;
};

const STORAGE_KEY = 'current-work-worker';

const getTodayInKorea = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export const setCurrentWorker = (worker: CurrentWorker) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(worker));
};

export const getCurrentWorker = (): CurrentWorker | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!value?.name || !value?.workDate) return null;
    const today = getTodayInKorea();
    if (String(value.workDate) !== today) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { name: String(value.name), workDate: String(value.workDate) };
  } catch {
    return null;
  }
};

export const getCurrentWorkerName = () => getCurrentWorker()?.name ?? '';

export const resolveCurrentWorkerName = async () => {
  const today = getTodayInKorea();
  const storedWorkerName = getCurrentWorkerName();
  const { data, error } = await supabase
    .from('work_journals')
    .select('worker_name')
    .eq('work_date', today)
    .eq('status', 'working')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return storedWorkerName;

  const latestWorkerName = data?.worker_name?.trim() ?? '';
  if (latestWorkerName) {
    setCurrentWorker({ name: latestWorkerName, workDate: today });
    return latestWorkerName;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return '';
};
