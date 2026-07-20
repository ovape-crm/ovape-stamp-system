export const cashManagementKeys = {
  all: () => ['cash-management'] as const,
  day: (date: string) => [...cashManagementKeys.all(), 'day', date] as const,
  history: (startDate?: string, endDate?: string) =>
    startDate && endDate
      ? ([...cashManagementKeys.all(), 'history', startDate, endDate] as const)
      : ([...cashManagementKeys.all(), 'history'] as const),
};
