export type SearchCondition = {
  searchTarget: string;
  searchKeyword: string;
};

export type ItemFilters = {
  categoryId?: string;
  searchConditions?: SearchCondition[];
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
