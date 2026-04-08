export type ItemFilters = {
  categoryId?: string;
  searchTarget?: string;
  searchKeyword?: string;
  isUse?: boolean;
  excludePurchasePrice?: boolean;
};

export const itemKeys = {
  all: () => ['items'] as const,
  lists: () => [...itemKeys.all(), 'list'] as const,
  list: (filters?: ItemFilters) =>
    [...itemKeys.lists(), filters ?? null] as const,
  categories: () => [...itemKeys.all(), 'categories'] as const,
};
