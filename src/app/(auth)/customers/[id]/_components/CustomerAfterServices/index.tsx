'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAfterServices } from '@/services/afterService';
import Loading from '@/app/_components/Loading';
import { AfterServiceItemTypeEnum } from '@/app/_enums/enums';
import { useRouter } from 'next/navigation';
import { getActionText } from '@/app/_utils/utils';

interface CustomerAfterServicesProps {
  customerId: string;
  refreshKey?: number;
}

type AfterServiceType = {
  id: string;
  customer_id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  symptom: string;
  note?: string | null;
  status: string;
  created_at: string;
  users: {
    name: string;
    email: string;
  } | null;
  customers: {
    name: string;
    phone: string;
  } | null;
};

const CustomerAfterServices = ({
  customerId,
  refreshKey = 0,
}: CustomerAfterServicesProps) => {
  const router = useRouter();
  const [afterServices, setAfterServices] = useState<AfterServiceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAfterServices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const data = await getAfterServices(100, 0, {
        customerId,
      });
      setAfterServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setAfterServices([]);
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchAfterServices();
  }, [refreshKey, fetchAfterServices]);

  const getStatusColor = (status: string) => {
    return getActionText(`after-service-${status}`).color;
  };

  const handleRowClick = (afterServiceId: string) => {
    router.push(`/after-services?id=${afterServiceId}`);
  };

  if (isLoading) {
    return <Loading size="lg" text="AS 목록 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center py-20">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (afterServices.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        AS 등록 내역이 없습니다.
      </div>
    );
  }

  const getItemTypeInfo = (itemType: string) => {
    const itemTypeOption = Object.values(AfterServiceItemTypeEnum).find(
      (opt) => opt.value === itemType
    );
    return itemTypeOption || { name: itemType, value: itemType };
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-brand-100 overflow-hidden overflow-x-auto">
      <table className="w-full min-w-[900px] divide-y divide-brand-100 text-xs sm:text-sm">
        <thead className="bg-gradient-to-r from-brand-50 to-brand-100">
          <tr>
            <th className="px-3 sm:px-6 py-2 sm:py-3 text-left font-semibold text-brand-700 whitespace-nowrap">
              No
            </th>
            <th className="px-3 sm:px-6 py-2 sm:py-3 text-center font-semibold text-brand-700 whitespace-nowrap">
              상태
            </th>
            <th className="px-3 sm:px-6 py-2 sm:py-3 text-left font-semibold text-brand-700 whitespace-nowrap">
              기기 종류
            </th>
            <th className="px-3 sm:px-6 py-2 sm:py-3 text-left font-semibold text-brand-700 whitespace-nowrap">
              제품 이름 / 수량
            </th>
            <th className="px-3 sm:px-6 py-2 sm:py-3 text-left font-semibold text-brand-700 w-64 whitespace-nowrap">
              증상
            </th>
            <th className="px-3 sm:px-6 py-2 sm:py-3 text-left font-semibold text-brand-700 whitespace-nowrap">
              등록일
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-brand-50">
          {afterServices.map((as, index) => {
            const statusInfo = getActionText(`after-service-${as.status}`);
            const itemTypeInfo = getItemTypeInfo(as.item_type);
            const date = new Date(as.created_at);
            const year = String(date.getFullYear()).slice(-2);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');
            const createdAt = `${year}.${month}.${day} ${hour}:${minute}`;

            return (
              <tr
                key={as.id}
                className="hover:bg-brand-50/50 transition-colors cursor-pointer whitespace-nowrap"
                onClick={() => handleRowClick(as.id)}
              >
                <td className="px-3 sm:px-6 py-2 sm:py-3 text-gray-700">
                  {index + 1}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-3 text-center">
                  <span
                    className={`inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold ${getStatusColor(
                      as.status
                    )}`}
                  >
                    {statusInfo.text}
                  </span>
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-3 text-gray-700">
                  {itemTypeInfo.name}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-3 text-gray-700">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span>{as.item_name}</span>
                    <span className="text-gray-400">/</span>
                    <span className="font-medium">{as.quantity}개</span>
                  </div>
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-3 text-gray-700 w-64">
                  <p className="truncate" title={as.symptom}>
                    {as.symptom}
                  </p>
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-3 text-gray-700">
                  {createdAt}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CustomerAfterServices;
