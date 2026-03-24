'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getComparisonDevicesWithValues,
  deleteComparisonDevice,
} from '@/app/_services/comparisonDeviceService';
import { useModal } from '@/app/_contexts/ModalContext';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';
import DeviceEditModal from '../DeviceEditModal';
import { comparisonKeys } from '@/app/_queryKeys/comparisonKeys';

type ValueMap = Record<string, Record<string, string>>;

interface DeviceListProps {
  refreshKey?: number;
}

const DeviceList = ({ refreshKey }: DeviceListProps) => {
  const { open, close } = useModal();
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: [...comparisonKeys.devices(), refreshKey],
    queryFn: getComparisonDevicesWithValues,
  });

  const columns = data?.columns ?? [];
  const devices = data?.devices ?? [];
  const valueMap: ValueMap = {};
  data?.values.forEach((v) => {
    if (!valueMap[v.device_id]) valueMap[v.device_id] = {};
    valueMap[v.device_id][v.column_id] = v.value;
  });

  const deleteMutation = useMutation({
    mutationFn: deleteComparisonDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.devices() });
      toast.success('기기가 삭제됐습니다.');
    },
    onError: () => toast.error('기기 삭제에 실패했습니다.'),
  });

  const handleEdit = (deviceId: string) => {
    open({
      content: (
        <DeviceEditModal
          deviceId={deviceId}
          initialValues={valueMap[deviceId] ?? {}}
          onCancel={close}
          onSuccess={() => {
            close();
            queryClient.invalidateQueries({ queryKey: comparisonKeys.devices() });
          }}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  if (isPending) {
    return (
      <div className="flex justify-center py-12">
        <Loading size="sm" text="불러오는 중..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-8 text-rose-600 text-xs sm:text-sm">
        데이터를 불러오는 데 실패했습니다.
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
                  disabled={deleteMutation.isPending}
                  onClick={() => handleEdit(device.id)}
                >
                  수정
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(device.id)}
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
