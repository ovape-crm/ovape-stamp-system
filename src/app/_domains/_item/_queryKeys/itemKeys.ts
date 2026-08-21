export type SearchCondition = {
  searchTarget: string;
  searchKeyword: string;
};

export type ItemFilters = {
  categoryId?: string;
  searchConditions?: SearchCondition[];
  searchKeyword?: string;
  isUse?: boolean;
};

export const itemKeys = {
  all: () => ['items'] as const,
  lists: () => [...itemKeys.all(), 'list'] as const,
  list: (filters?: ItemFilters) =>
    [...itemKeys.lists(), filters ?? null] as const,
  search: (keyword: string) =>
    [...itemKeys.all(), 'search', keyword] as const,
  categories: () => [...itemKeys.all(), 'categories'] as const,
};
