export type ManualSearchCondition = {
  searchTarget: string;
  searchKeyword: string;
};

export type ManualFilters = {
  subCategoryId?: string;
  subCategoryIds?: string[];
  searchConditions?: ManualSearchCondition[];
};

export const manualKeys = {
  all: () => ['manuals'] as const,
  lists: () => [...manualKeys.all(), 'list'] as const,
  list: (filters?: ManualFilters) => [...manualKeys.lists(), filters ?? null] as const,
  categoryTree: (tab?: string) => [...manualKeys.all(), 'categoryTree', tab ?? null] as const,
};
