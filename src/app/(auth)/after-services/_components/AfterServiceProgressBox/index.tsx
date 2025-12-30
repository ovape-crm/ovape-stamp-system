'use client';

import { useEffect, useState } from 'react';
import { getAfterServices } from '@/services/afterService';

const AfterServiceProgressBox = ({
  refreshKey = 0,
}: {
  refreshKey?: number;
}) => {
  const [stats, setStats] = useState([
    { label: '전체', value: 0 },
    { label: '접수', value: 0 },
    { label: '진행 중', value: 0 },
    { label: '처리 완료', value: 0 },
  ]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        // 전체 AS 목록 가져오기 (필터 없이)
        const allAfterServices = await getAfterServices(1000, 0);

        // 상태 분류
        const receivedStatuses = ['received'];
        const inProgressStatuses = [
          'exchange',
          'rental',
          'sent_for_repair',
          'repair_returned',
          'other',
        ];
        const completedStatuses = [
          'repair_rejected',
          'customer_received',
          'repair_returned_completed',
          'returned',
        ];

        const receivedCount = allAfterServices.filter((as) =>
          receivedStatuses.includes(as.status)
        ).length;
        const inProgressCount = allAfterServices.filter((as) =>
          inProgressStatuses.includes(as.status)
        ).length;
        const completedCount = allAfterServices.filter((as) =>
          completedStatuses.includes(as.status)
        ).length;

        const totalCount = allAfterServices.length;

        setStats([
          { label: '전체', value: totalCount },
          { label: '접수', value: receivedCount },
          { label: '진행 중', value: inProgressCount },
          { label: '처리 완료', value: completedCount },
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
      <div className="flex gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="w-[160px] bg-white rounded-lg shadow-sm border border-brand-100 p-4"
          >
            <div className="flex flex-col">
              <div className="h-4 w-12 bg-gray-200 rounded animate-pulse mb-1.5" />
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {stats.map((stat, index) => (
        <div
          key={index}
          className="w-[160px] bg-white rounded-lg shadow-sm border border-brand-100 p-4"
        >
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-600 mb-1.5">
              {stat.label}
            </span>
            <span className={`text-2xl font-bold ${getValueColor(stat.label)}`}>
              {stat.value.toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AfterServiceProgressBox;
