export type AfterServiceFilters = {
  status?: string;
  groupStatus?: 'received' | 'inProgress' | 'completed';
  searchTarget?: string;
  searchKeyword?: string;
};

export const afterServiceKeys = {
  all: () => ['afterServices'] as const,
  lists: () => [...afterServiceKeys.all(), 'list'] as const,
  list: (filters?: AfterServiceFilters) =>
    [...afterServiceKeys.lists(), filters ?? null] as const,
  detail: (id: string | null) =>
    [...afterServiceKeys.all(), 'detail', id] as const,
  stats: () => [...afterServiceKeys.all(), 'stats'] as const,
};
