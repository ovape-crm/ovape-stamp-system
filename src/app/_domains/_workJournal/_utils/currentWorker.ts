export type CurrentWorker = {
  name: string;
  workDate: string;
};

const STORAGE_KEY = 'current-work-worker';

export const getCurrentWorker = (): CurrentWorker | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!value?.name || !value?.workDate) return null;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
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
