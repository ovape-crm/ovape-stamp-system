'use client';

import { useState } from 'react';
import { AfterServiceStatusEnum } from '@/app/_enums/enums';

interface StatusBoxProps {
  status: string;
  onEdit?: () => void;
}

const StatusBox = ({ status, onEdit }: StatusBoxProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const getStatusInfo = (statusValue: string) => {
    const statusOption = Object.values(AfterServiceStatusEnum).find(
      (opt) => opt.value === statusValue
    );
    return statusOption || { name: statusValue, value: statusValue };
  };

  // 상태 그룹별 색상 분류 (AfterServiceProgressBox 참조)
  const getStatusColor = (statusValue: string) => {
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

    if (receivedStatuses.includes(statusValue)) {
      return {
        group: '접수',
        bg: 'from-gray-50/50 to-gray-50/30',
        border: 'border-gray-200 hover:border-gray-300',
        dot: 'bg-gray-500 shadow-gray-500/50',
        text: 'text-gray-700',
        icon: 'text-gray-600',
        groupBg: 'bg-gray-100',
        groupText: 'text-gray-700',
      };
    } else if (inProgressStatuses.includes(statusValue)) {
      return {
        group: '진행 중',
        bg: 'from-blue-50/50 to-indigo-50/30',
        border: 'border-blue-200 hover:border-blue-300',
        dot: 'bg-blue-500 shadow-blue-500/50',
        text: 'text-blue-700',
        icon: 'text-blue-600',
        groupBg: 'bg-blue-100',
        groupText: 'text-blue-700',
      };
    } else if (completedStatuses.includes(statusValue)) {
      return {
        group: '처리 완료',
        bg: 'from-green-50/50 to-emerald-50/30',
        border: 'border-green-200 hover:border-green-300',
        dot: 'bg-green-500 shadow-green-500/50',
        text: 'text-green-700',
        icon: 'text-green-600',
        groupBg: 'bg-green-100',
        groupText: 'text-green-700',
      };
    }
    // 기본값: 회색
    return {
      group: '접수',
      bg: 'from-gray-50/50 to-gray-50/30',
      border: 'border-gray-200 hover:border-gray-300',
      dot: 'bg-gray-500 shadow-gray-500/50',
      text: 'text-gray-700',
      icon: 'text-gray-600',
      groupBg: 'bg-gray-100',
      groupText: 'text-gray-700',
    };
  };

  const colors = getStatusColor(status);

  return (
    <div
      className={`p-3 rounded-lg border-2 ${colors.bg} ${colors.border} flex flex-col items-center justify-center relative cursor-pointer transition-all`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onEdit}
    >
      {isHovered && (
        <div className="absolute top-2 right-2">
          <svg
            className={`w-4 h-4 ${colors.icon}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </div>
      )}
      <div className="flex flex-col items-center justify-center gap-3 w-full">
        {/* 그룹 라벨 */}
        <div
          className={`px-3 py-1 rounded-full text-xs font-semibold ${colors.groupBg} ${colors.groupText}`}
        >
          {colors.group}
        </div>
        {/* 상태 이름 */}
        {status === 'repair_returned_completed' ? (
          <div
            className={`text-2xl font-bold ${colors.text} tracking-wide text-center`}
          >
            <div>수리 수령</div>
            <div className="text-lg">(재고 처리)</div>
          </div>
        ) : (
          <span className={`text-2xl font-bold ${colors.text} tracking-wide`}>
            {getStatusInfo(status).name}
          </span>
        )}
      </div>
    </div>
  );
};

export default StatusBox;
