'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getComparisonDevicesWithValues,
  deleteComparisonDevice,
} from '@/app/_services/comparisonDeviceService';
import {
  ComparisonColumnType,
  ComparisonDeviceType,
  ComparisonDeviceValueType,
} from '@/app/_types/comparison.types';
import { useModal } from '@/app/_contexts/ModalContext';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';
import DeviceEditModal from '../DeviceEditModal';

type ValueMap = Record<string, Record<string, string>>;

interface DeviceListProps {
  refreshKey?: number;
}

const DeviceList = ({ refreshKey }: DeviceListProps) => {
  const { open, close } = useModal();
  const [columns, setColumns] = useState<ComparisonColumnType[]>([]);
  const [devices, setDevices] = useState<ComparisonDeviceType[]>([]);
  const [valueMap, setValueMap] = useState<ValueMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const { devices, columns, values } = await getComparisonDevicesWithValues();

      const map: ValueMap = {};
      values.forEach((v: ComparisonDeviceValueType) => {
        if (!map[v.device_id]) map[v.device_id] = {};
        map[v.device_id][v.column_id] = v.value;
      });

      setDevices(devices);
      setColumns(columns);
      setValueMap(map);
    } catch {
      setError('데이터를 불러오는 데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEdit = (device: ComparisonDeviceType) => {
    open({
      content: (
        <DeviceEditModal
          deviceId={device.id}
          initialValues={valueMap[device.id] ?? {}}
          onCancel={close}
          onSuccess={() => {
            close();
            void loadData();
          }}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  const handleDelete = async (deviceId: string) => {
    try {
      setDeletingId(deviceId);
      await deleteComparisonDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      toast.success('기기가 삭제됐습니다.');
    } catch {
      toast.error('기기 삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loading size="sm" text="불러오는 중..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-rose-600 text-xs sm:text-sm">
        {error}
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-xs sm:text-sm">
        등록된 기기가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs sm:text-sm border-separate border-spacing-0">
        <thead>
          <tr className="bg-brand-50">
            <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap w-10 border-b border-r border-brand-100">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-r border-brand-100"
              >
                {col.name}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap border-b border-brand-100">
              작업
            </th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device, index) => (
            <tr
              key={device.id}
              className={`hover:bg-brand-50/50 transition-colors ${index % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
            >
              <td className="px-3 py-2.5 text-gray-400 border-b border-r border-brand-50">{index + 1}</td>
              {columns.map((col) => (
                <td key={col.id} className="px-3 py-2.5 text-gray-700 whitespace-nowrap border-b border-r border-brand-50">
                  {valueMap[device.id]?.[col.id] ?? (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
              ))}
              <td className="px-3 py-2.5 text-right whitespace-nowrap space-x-1 border-b border-brand-50">
                <Button
                  size="xs"
                  variant="gray"
                  disabled={deletingId === device.id}
                  onClick={() => handleEdit(device)}
                >
                  수정
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={deletingId === device.id}
                  onClick={() => handleDelete(device.id)}
                >
                  삭제
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DeviceList;
