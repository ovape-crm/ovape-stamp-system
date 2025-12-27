'use client';

interface UpdatedDateProps {
  updatedAt: string;
}

const UpdatedDate = ({ updatedAt }: UpdatedDateProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = String(date.getFullYear()).slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hour}:${minute}`;
  };

  return (
    <div className="pt-4 border-t border-brand-100">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <svg
          className="w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span className="text-xs font-medium text-gray-500">최종 수정일:</span>
        <span className="font-medium text-gray-700">{formatDate(updatedAt)}</span>
      </div>
    </div>
  );
};

export default UpdatedDate;

