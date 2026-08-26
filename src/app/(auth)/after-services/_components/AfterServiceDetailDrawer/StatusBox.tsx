'use client';

import { useState } from 'react';
import { getActionText } from '@/app/_utils/utils';

interface StatusBoxProps {
  status: string;
  onEdit?: () => void;
  onAdvance?: () => void;
}

const StatusBox = ({ status, onEdit, onAdvance }: StatusBoxProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const statusText = getActionText(`after-service-${status}`).text;
  const shouldBreakStatusLine = [
    'repair_returned_completed',
    'other',
    'other_in_progress',
  ].includes(status);
  const [statusName, statusDetail] = shouldBreakStatusLine
    ? statusText.split(' (')
    : [statusText];

  const getStatusColor = (statusValue: string) => {
    const actionInfo = getActionText(`after-service-${statusValue}`);
    const colorClass = actionInfo.color;

    // color 클래스에서 색상 타입 추출 (text-gray-700 bg-gray-100 -> gray)
    let colorType = 'gray'; // 기본값
    if (colorClass.includes('blue')) {
      colorType = 'blue';
    } else if (colorClass.includes('green')) {
      colorType = 'green';
    } else if (colorClass.includes('gray')) {
      colorType = 'gray';
    }

    // 색상 타입별 스타일 매핑
    const colorMap: Record<
      string,
      {
        group: string;
        bg: string;
        border: string;
        dot: string;
        text: string;
        icon: string;
        groupBg: string;
        groupText: string;
      }
    > = {
      gray: {
        group: '접수',
        bg: 'from-gray-50/50 to-gray-50/30',
        border: 'border-gray-200 hover:border-gray-300',
        dot: 'bg-gray-500 shadow-gray-500/50',
        text: 'text-gray-700',
        icon: 'text-gray-600',
        groupBg: 'bg-gray-100',
        groupText: 'text-gray-700',
      },
      blue: {
        group: '진행 중',
        bg: 'from-blue-50/50 to-indigo-50/30',
        border: 'border-blue-200 hover:border-blue-300',
        dot: 'bg-blue-500 shadow-blue-500/50',
        text: 'text-blue-700',
        icon: 'text-blue-600',
        groupBg: 'bg-blue-100',
        groupText: 'text-blue-700',
      },
      green: {
        group: '처리 완료',
        bg: 'from-green-50/50 to-emerald-50/30',
        border: 'border-green-200 hover:border-green-300',
        dot: 'bg-green-500 shadow-green-500/50',
        text: 'text-green-700',
        icon: 'text-green-600',
        groupBg: 'bg-green-100',
        groupText: 'text-green-700',
      },
    };

    return colorMap[colorType] || colorMap.gray;
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
        {shouldBreakStatusLine ? (
          <div
            className={`text-2xl font-bold ${colors.text} tracking-wide text-center`}
          >
            <div>{statusName}</div>
            {statusDetail && <div className="text-lg">({statusDetail}</div>}
          </div>
        ) : (
          <span className={`text-2xl font-bold ${colors.text} tracking-wide`}>
            {statusText}
          </span>
        )}
      </div>
      {onAdvance && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAdvance();
          }}
          className="mt-3 cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:border-brand-300 hover:text-brand-700"
        >
          다음 진행상황 처리
        </button>
      )}
    </div>
  );
};

export default StatusBox;
