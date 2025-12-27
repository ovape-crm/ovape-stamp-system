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

  return (
    <div
      className="p-3 rounded-lg border-2 border-gray-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 flex flex-col items-center justify-center relative cursor-pointer transition-all hover:border-blue-300"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onEdit}
    >
      {isHovered && (
        <div className="absolute top-2 right-2">
          <svg
            className="w-4 h-4 text-blue-600"
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
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shadow-lg shadow-blue-500/50"></div>
        <span className="text-2xl font-bold text-blue-700 tracking-wide">
          {getStatusInfo(status).name}
        </span>
      </div>
    </div>
  );
};

export default StatusBox;

