'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import { getComparisonDevicesWithValues } from '@/app/_domains/_comparison/_services/comparisonDeviceService';
import {
  ComparisonColumnType,
  ComparisonDeviceType,
} from '@/app/_domains/_comparison/_types/comparison.types';
import { comparisonKeys } from '@/app/_domains/_comparison/_queryKeys/comparisonKeys';

type ValueMap = Record<string, string>;

interface DeviceSelectModalProps {
  excludeDeviceIds: string[];
  onSelect: (device: ComparisonDeviceType, valueMap: ValueMap) => void;
  onCancel: () => void;
}

export default function DeviceSelectModal({
  excludeDeviceIds,
  onSelect,
  onCancel,
}: DeviceSelectModalProps) {
  const [query, setQuery] = useState('');

  const { data, isPending, isError } = useQuery({
    queryKey: comparisonKeys.devices(),
    queryFn: getComparisonDevicesWithValues,
  });

  const columns: ComparisonColumnType[] = data?.columns ?? [];
  const valueMapByDevice: Record<string, ValueMap> = {};
  data?.values.forEach((v) => {
    if (!valueMapByDevice[v.device_id]) valueMapByDevice[v.device_id] = {};
    valueMapByDevice[v.device_id][v.column_id] = v.value;
  });

  const availableDevices = (data?.devices ?? [])
    .filter((d) => !excludeDeviceIds.includes(d.id))
    .filter((d) => {
      if (!query.trim()) return true;
      const keyword = query.trim().toLowerCase();
      return Object.values(valueMapByDevice[d.id] ?? {}).some((v) =>
        v.toLowerCase().includes(keyword),
      );
    });

  return (
    <div className="w-full flex flex-col min-h-0">
      <h2 className="text-lg font-semibold mb-3 shrink-0">기기 선택</h2>

      <input
        className="w-full mb-3 rounded border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 shrink-0"
        placeholder="검색어 입력..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="overflow-y-auto min-h-0 flex-1">
        {isPending ? (
          <div className="flex justify-center py-8">
            <Loading size="sm" text="불러오는 중..." />
          </div>
        ) : isError ? (
          <p className="rounded-lg bg-rose-50 px-4 py-8 text-center text-sm text-rose-600">
            기기 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : columns.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-4 py-8 text-center text-sm text-amber-700">
            표시할 기기 비교 항목이 없습니다. 먼저 컬럼 관리에서 항목을 등록해 주세요.
          </p>
        ) : availableDevices.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            {query.trim() ? '검색 결과가 없습니다.' : '선택 가능한 기기가 없습니다.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-brand-100">
                  {columns.map((col) => (
                    <th
                      key={col.id}
                      className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap"
                    >
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {availableDevices.map((device) => (
                  <tr
                    key={device.id}
                    className="border-b border-brand-50 hover:bg-brand-50/60 cursor-pointer transition-colors"
                    onClick={() =>
                      onSelect(device, valueMapByDevice[device.id] ?? {})
                    }
                  >
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className="px-3 py-2.5 text-gray-700 whitespace-nowrap"
                      >
                        {valueMapByDevice[device.id]?.[col.id] ?? (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-200 mt-4 shrink-0">
        <Button size="sm" variant="gray" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
