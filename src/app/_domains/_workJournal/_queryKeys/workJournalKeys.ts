export const workJournalKeys = {
  all: () => ['work-journal'] as const,
  month: (month: string, workerName: string) =>
    [...workJournalKeys.all(), month, workerName] as const,
  range: (startDate: string, endDate: string, workerName: string) =>
    [...workJournalKeys.all(), 'range', startDate, endDate, workerName] as const,
  workers: () => [...workJournalKeys.all(), 'workers'] as const,
  workerDetails: () => [...workJournalKeys.all(), 'worker-details'] as const,
  payrollHistory: () => [...workJournalKeys.all(), 'payroll-history'] as const,
};
