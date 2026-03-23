'use client';

import { useEffect, useState } from 'react';
import Button from '@/app/_components/Button';
import Loading from '@/app/_components/Loading';
import { getComparisonDevicesWithValues } from '@/app/_services/comparisonDeviceService';
import {
  ComparisonColumnType,
  ComparisonDeviceType,
} from '@/app/_types/comparison.types';

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
  const [columns, setColumns] = useState<ComparisonColumnType[]>([]);
  const [devices, setDevices] = useState<ComparisonDeviceType[]>([]);
  const [valueMapByDevice, setValueMapByDevice] = useState<
    Record<string, ValueMap>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        const { devices, columns, values } =
          await getComparisonDevicesWithValues();

        const map: Record<string, ValueMap> = {};
        values.forEach((v) => {
          if (!map[v.device_id]) map[v.device_id] = {};
          map[v.device_id][v.column_id] = v.value;
        });

        setDevices(devices);
        setColumns(columns);
        setValueMapByDevice(map);
      } finally {
        setIsLoading(false);
      }
    };
    void fetch();
  }, []);

  const availableDevices = devices
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
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loading size="sm" text="불러오는 중..." />
          </div>
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
