import { LogCategoryEnumType } from '@/app/_enums/enums';

export const logKeys = {
  all: () => ['logs'] as const,
  lists: () => [...logKeys.all(), 'list'] as const,
  list: (params: {
    category: LogCategoryEnumType['value'];
    dateRange?: { start: string; end: string } | null;
    paymentMethod?: string | null;
    searchKeyword?: string | null;
  }) => [...logKeys.lists(), params] as const,
  byAfterService: (afterServiceId: number) =>
    ['logs', 'byAfterService', afterServiceId] as const,
  byCustomerAll: (customerId: string) =>
    ['logs', 'byCustomer', customerId] as const,
  byCustomer: (customerId: string, category: string) =>
    ['logs', 'byCustomer', customerId, category] as const,
};
