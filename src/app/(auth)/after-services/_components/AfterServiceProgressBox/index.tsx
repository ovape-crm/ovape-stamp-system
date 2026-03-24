'use client';

import { useQuery } from '@tanstack/react-query';
import { getAfterServices } from '@/app/_services/afterService';
import { getAfterServiceStatusGroups } from '@/app/_utils/utils';
import { afterServiceKeys } from '@/app/_queryKeys/afterServiceKeys';

interface AfterServiceProgressBoxProps {
  onGroupClick?: (
    group: 'all' | 'received' | 'inProgress' | 'completed',
  ) => void;
  selectedGroup?: 'received' | 'inProgress' | 'completed';
  onClearGroup?: () => void;
}

const DEFAULT_STATS = [
  { label: '전체', value: 0, group: 'all' as const },
  { label: '접수', value: 0, group: 'received' as const },
  { label: '진행 중', value: 0, group: 'inProgress' as const },
  { label: '처리 완료', value: 0, group: 'completed' as const },
];

const AfterServiceProgressBox = ({
  onGroupClick,
  selectedGroup,
  onClearGroup,
}: AfterServiceProgressBoxProps) => {
  const { data: stats = DEFAULT_STATS, isPending: isLoading } = useQuery({
    queryKey: afterServiceKeys.stats(),
    queryFn: async () => {
      const allAfterServices = await getAfterServices(1000, 0);
      const statusGroups = getAfterServiceStatusGroups();

      const receivedCount = allAfterServices.filter((as) =>
        statusGroups.received.includes(as.status),
      ).length;
      const inProgressCount = allAfterServices.filter((as) =>
        statusGroups.inProgress.includes(as.status),
      ).length;
      const completedCount = allAfterServices.filter((as) =>
        statusGroups.completed.includes(as.status),
      ).length;

      return [
        { label: '전체', value: allAfterServices.length, group: 'all' as const },
        { label: '접수', value: receivedCount, group: 'received' as const },
        { label: '진행 중', value: inProgressCount, group: 'inProgress' as const },
        { label: '처리 완료', value: completedCount, group: 'completed' as const },
      ];
    },
  });

  const getValueColor = (label: string) => {
    if (label === '전체') return 'text-gray-900';
    if (label === '접수') return 'text-gray-600';
    if (label === '진행 중') return 'text-blue-600';
    if (label === '처리 완료') return 'text-green-600';
    return 'text-gray-900';
  };

  if (isLoading) {
    return (
      <div className="flex gap-1.5 sm:gap-4 items-start">
        {DEFAULT_STATS.map((stat, index) => (
          <div
            key={index}
            className="w-[72px] sm:w-[140px] bg-white rounded-lg shadow-sm border border-brand-100 p-2.5 sm:p-3"
          >
            <div className="flex flex-col">
              <div className="h-3 sm:h-4 w-9 sm:w-12 bg-gray-200 rounded animate-pulse mb-1" />
              <div className="h-5 sm:h-8 w-12 sm:w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 sm:gap-4 items-start">
      {stats.map((stat, index) => {
        const isSelected = selectedGroup && stat.group === selectedGroup;
        const isAllGroup = stat.group === 'all';
        const isClickable = onGroupClick && !isAllGroup;
        return (
          <div
            key={index}
            className={`w-[72px] sm:w-[140px] bg-white rounded-lg shadow-sm border p-2.5 sm:p-3 relative ${
              isSelected ? 'border-brand-500 border-2' : 'border-brand-100'
            } ${
              isClickable
                ? 'cursor-pointer hover:shadow-md hover:border-brand-300 transition-all'
                : ''
            }`}
            onClick={isClickable ? () => onGroupClick?.(stat.group) : undefined}
          >
            {isSelected && onClearGroup && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearGroup();
                }}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                title="그룹 필터 해제"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
            <div className="flex flex-col">
              <span className="text-[10px] sm:text-[13px] font-medium text-gray-600 mb-1">
                {stat.label}
              </span>
              <span
                className={`text-lg sm:text-xl font-bold ${getValueColor(
                  stat.label,
                )}`}
              >
                {stat.value.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AfterServiceProgressBox;
