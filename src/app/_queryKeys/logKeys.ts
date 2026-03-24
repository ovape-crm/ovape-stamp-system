import { LogCategoryEnumType } from '@/app/_enums/enums';

export const logKeys = {
  list: (params: {
    category: LogCategoryEnumType['value'];
    dateRange?: { start: string; end: string } | null;
  }) => ['logs', 'list', params] as const,
  byAfterService: (afterServiceId: number) =>
    ['logs', 'byAfterService', afterServiceId] as const,
};
