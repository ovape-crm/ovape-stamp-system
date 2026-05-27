export type InventorySearchCondition = {
  searchTarget: string;
  searchKeyword: string;
};

export type InventoryFilters = {
  categoryId?: string;
  searchConditions?: InventorySearchCondition[];
  isUse?: boolean;
};

export const inventoryKeys = {
  all: () => ['inventory'] as const,
  lists: () => [...inventoryKeys.all(), 'list'] as const,
  list: (filters?: InventoryFilters) =>
    [...inventoryKeys.lists(), filters ?? null] as const,
  details: () => [...inventoryKeys.all(), 'detail'] as const,
  detail: (id: string) => [...inventoryKeys.details(), id] as const,
};
