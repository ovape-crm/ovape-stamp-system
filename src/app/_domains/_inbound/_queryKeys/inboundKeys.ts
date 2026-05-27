export type InboundFilters = {
  dateFrom?: string;
  dateTo?: string;
  itemName?: string;
};

export const inboundKeys = {
  all: () => ['inbound'] as const,
  lists: () => [...inboundKeys.all(), 'list'] as const,
  list: (filters?: InboundFilters) =>
    [...inboundKeys.lists(), filters ?? null] as const,
};
