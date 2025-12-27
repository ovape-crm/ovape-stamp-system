'use client';

import { AfterServiceStatusEnum } from '@/app/_enums/enums';

interface StatusBoxProps {
  status: string;
}

const StatusBox = ({ status }: StatusBoxProps) => {
  const getStatusInfo = (statusValue: string) => {
    const statusOption = Object.values(AfterServiceStatusEnum).find(
      (opt) => opt.value === statusValue
    );
    return statusOption || { name: statusValue, value: statusValue };
  };

  return (
    <div className="p-3 rounded-lg border-2 border-gray-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 flex flex-col items-center justify-center">
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

