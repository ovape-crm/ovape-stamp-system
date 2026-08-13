export type CustomerListParams = {
  target?: "all" | "name" | "phone";
  keyword?: string;
  sortBy?: "recent_usage" | "name" | "stamp" | "created_at";
  sortOrder?: "asc" | "desc";
};

export const customerKeys = {
  all: () => ["customers"] as const,
  lists: () => [...customerKeys.all(), "list"] as const,
  list: (params?: CustomerListParams) =>
    [...customerKeys.lists(), params ?? null] as const,
  detail: (id: string) => [...customerKeys.all(), "detail", id] as const,
  afterServices: (customerId: string) =>
    [...customerKeys.all(), "afterServices", customerId] as const,
};
