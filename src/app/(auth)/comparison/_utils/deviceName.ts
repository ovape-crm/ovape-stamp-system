import { ComparisonColumnType } from '@/app/_domains/_comparison/_types/comparison.types';

const deviceNamePattern = /브랜드.*기기|기기.*(명|이름)|제품.*(명|이름)/;

export const getComparisonDeviceName = (
  columns: ComparisonColumnType[],
  valueMap: Record<string, string>,
  fallback = '기기',
) => {
  const nameColumn = columns.find((column) => deviceNamePattern.test(column.name));
  return nameColumn
    ? valueMap[nameColumn.id]?.trim() || fallback
    : Object.values(valueMap).find((value) => value.trim()) || fallback;
};
