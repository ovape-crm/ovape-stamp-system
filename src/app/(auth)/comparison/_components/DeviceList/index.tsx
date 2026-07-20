'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getComparisonDevicesWithValues,
  deleteComparisonDevice,
} from '@/app/_domains/_comparison/_services/comparisonDeviceService';
import { useModal } from '@/app/_contexts/ModalContext';
import Loading from '@/app/_components/Loading';
import Button from '@/app/_components/Button';
import DeviceEditModal from '../DeviceEditModal';
import { comparisonKeys } from '@/app/_domains/_comparison/_queryKeys/comparisonKeys';
import { useUser } from '@/app/_contexts/UserContext';
import DeleteConfirmModal from '@/app/(auth)/_components/DeleteConfirmModal';

type ValueMap = Record<string, Record<string, string>>;

interface DeviceListProps {
  refreshKey?: number;
}

const DeviceList = ({ refreshKey }: DeviceListProps) => {
  const { open, close } = useModal();
  const { isAdmin } = useUser();
  const queryClient = useQueryClient();
  const [searchKeyword, setSearchKeyword] = useState('');

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
  const normalizedKeyword = searchKeyword.trim().toLocaleLowerCase('ko-KR');
  const searchableColumns = columns.filter((column) => {
    const normalizedName = column.name.replaceAll(' ', '').toLocaleLowerCase('ko-KR');
    const normalizedKey = column.key.replaceAll('_', '').toLocaleLowerCase();
    return (
      normalizedName.includes('브랜드') ||
      normalizedName.includes('기기명') ||
      normalizedKey.includes('brand') ||
      normalizedKey.includes('devicename')
    );
  });
  const filteredDevices = normalizedKeyword
    ? devices.filter((device) =>
        searchableColumns.some((column) =>
          (valueMap[device.id]?.[column.id] ?? '')
            .toLocaleLowerCase('ko-KR')
            .includes(normalizedKeyword),
        ),
      )
    : devices;

  const deleteMutation = useMutation({
    mutationFn: deleteComparisonDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.devices() });
      toast.success('기기가 삭제됐습니다.');
    },
    onError: () => toast.error('기기 삭제에 실패했습니다.'),
  });

  const handleDelete = (deviceId: string) => {
    open({
      content: (
        <DeleteConfirmModal
          title="기기 삭제"
          description="이 기기를 삭제하시겠습니까?"
          onConfirm={async () => {
            await deleteMutation.mutateAsync(deviceId);
            close();
          }}
          onCancel={close}
        />
      ),
      options: { dismissOnBackdrop: false },
    });
  };

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
    <div className="flex min-h-0 flex-col">
      <div className="sticky top-0 z-20 mb-3 flex items-center justify-between gap-3 border-b border-brand-50 bg-white pb-3">
        <div className="relative w-full max-w-sm">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
            />
          </svg>
          <input
            type="search"
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
            placeholder="브랜드 또는 기기명을 입력하세요"
            className="w-full rounded-lg border border-brand-200 bg-white py-2 pl-9 pr-3 text-xs outline-none transition-colors placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:text-sm"
          />
        </div>
        {searchKeyword.trim() && (
          <span className="shrink-0 text-xs text-gray-500">
            {filteredDevices.length}개 검색됨
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs sm:text-sm border-separate border-spacing-0">
        <thead>
          <tr className="bg-brand-50">
            <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap w-10 border-b border-r border-brand-100">
              #
            </th>
            <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-r border-brand-100">
              작업
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-r border-brand-100"
              >
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredDevices.map((device, index) => (
            <tr
              key={device.id}
              className={`hover:bg-brand-50/50 transition-colors ${index % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
            >
              <td className="px-3 py-2.5 text-gray-400 border-b border-r border-brand-50">{index + 1}</td>
              <td className="px-3 py-2.5 whitespace-nowrap space-x-1 border-b border-r border-brand-50">
                <Button
                  size="xs"
                  variant="gray"
                  disabled={deleteMutation.isPending}
                  onClick={() => handleEdit(device.id)}
                >
                  수정
                </Button>
                {isAdmin && (
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => handleDelete(device.id)}
                  >
                    삭제
                  </Button>
                )}
              </td>
              {columns.map((col) => (
                <td key={col.id} className="px-3 py-2.5 text-gray-700 whitespace-nowrap border-b border-r border-brand-50">
                  {valueMap[device.id]?.[col.id] ?? (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          {filteredDevices.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + 2}
                className="px-4 py-10 text-center text-gray-500"
              >
                검색 결과가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
};

export default DeviceList;
