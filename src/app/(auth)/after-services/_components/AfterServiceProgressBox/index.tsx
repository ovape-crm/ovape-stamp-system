'use client';

import { useEffect, useState } from 'react';
import { getAfterServices } from '@/app/_services/afterService';
import { getAfterServiceStatusGroups } from '@/app/_utils/utils';

interface AfterServiceProgressBoxProps {
  refreshKey?: number;
  onGroupClick?: (
    group: 'all' | 'received' | 'inProgress' | 'completed',
  ) => void;
  selectedGroup?: 'received' | 'inProgress' | 'completed';
  onClearGroup?: () => void;
}

const AfterServiceProgressBox = ({
  refreshKey = 0,
  onGroupClick,
  selectedGroup,
  onClearGroup,
}: AfterServiceProgressBoxProps) => {
  const [stats, setStats] = useState<
    Array<{
      label: string;
      value: number;
      group: 'all' | 'received' | 'inProgress' | 'completed';
    }>
  >([
    { label: '전체', value: 0, group: 'all' },
    { label: '접수', value: 0, group: 'received' },
    { label: '진행 중', value: 0, group: 'inProgress' },
    { label: '처리 완료', value: 0, group: 'completed' },
  ]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        // 전체 AS 목록 가져오기 (필터 없이)
        const allAfterServices = await getAfterServices(1000, 0);

        // 상태 분류
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

        const totalCount = allAfterServices.length;

        setStats([
          { label: '전체', value: totalCount, group: 'all' },
          { label: '접수', value: receivedCount, group: 'received' },
          { label: '진행 중', value: inProgressCount, group: 'inProgress' },
          { label: '처리 완료', value: completedCount, group: 'completed' },
        ]);
      } catch (error) {
        console.error('Failed to fetch AS stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [refreshKey]);

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
        {stats.map((stat, index) => (
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
