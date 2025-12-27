'use client';

const AfterServiceProgressBox = () => {
  // TODO: 실제 데이터로 교체 예정
  const stats = [
    {
      label: '접수',
      value: 0,
      color: 'blue',
    },
    {
      label: '진행 중',
      value: 0,
      color: 'orange',
    },
    {
      label: '처리 완료',
      value: 0,
      color: 'green',
    },
  ];

  const getValueColor = (label: string) => {
    if (label === '접수') return 'text-gray-900';
    if (label === '진행 중') return 'text-blue-600';
    if (label === '처리 완료') return 'text-green-600';
    return 'text-gray-900';
  };

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
