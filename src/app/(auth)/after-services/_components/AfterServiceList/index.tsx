'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAfterServices } from '@/services/afterService';
import Loading from '@/app/_components/Loading';
import { formatPhoneNumber } from '@/app/_utils/utils';
import {
  AfterServiceStatusEnum,
  AfterServiceItemTypeEnum,
} from '@/app/_enums/enums';

interface AfterServiceListProps {
  refreshKey?: number;
  onRowClick?: (afterServiceId: string) => void;
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

const AfterServiceList = ({
  refreshKey,
  onRowClick,
}: AfterServiceListProps) => {
  const [afterServices, setAfterServices] = useState<AfterServiceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAfterServices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const data = await getAfterServices(100, 0); // 일단 100개까지 가져오기
      setAfterServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setAfterServices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAfterServices();
  }, [refreshKey, fetchAfterServices]);

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

  const getStatusInfo = (status: string) => {
    const statusOption = Object.values(AfterServiceStatusEnum).find(
      (opt) => opt.value === status
    );
    return statusOption || { name: status, value: status };
  };

  const getItemTypeInfo = (itemType: string) => {
    const itemTypeOption = Object.values(AfterServiceItemTypeEnum).find(
      (opt) => opt.value === itemType
    );
    return itemTypeOption || { name: itemType, value: itemType };
  };

  return (
    <div className="mb-10">
      <div className="flex justify-start items-center mb-3">
        <div className="text-sm text-gray-600">
          총{' '}
          <span className="font-semibold text-brand-600">
            {afterServices.length}
          </span>
          건
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 overflow-hidden">
        <table className="min-w-full divide-y divide-brand-100">
          <thead className="bg-gradient-to-r from-brand-50 to-brand-100">
            <tr>
              <th className="px-6 py-4 text-center text-sm font-semibold text-brand-700">
                상태
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-brand-700">
                No
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-brand-700">
                고객
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-brand-700">
                기기 종류
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-brand-700">
                기기/제품 이름
              </th>
              <th className="px-6 py-4 text-center text-sm font-semibold text-brand-700">
                수량
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-brand-700">
                증상
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-brand-700">
                생성일
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-brand-50">
            {afterServices.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-6 py-10 text-center text-gray-500"
                >
                  AS 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              afterServices.map((as, index) => {
                const statusInfo = getStatusInfo(as.status);
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
                    className="hover:bg-brand-50/50 transition-colors cursor-pointer"
                    onClick={() => onRowClick?.(as.id)}
                  >
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        {statusInfo.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">
                          {as.customers?.name || '-'}
                        </p>
                        <p className="text-xs text-gray-600">
                          {as.customers?.phone
                            ? formatPhoneNumber(as.customers.phone)
                            : '-'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {itemTypeInfo.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {as.item_name}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-700">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-semibold bg-brand-100 text-brand-700">
                        {as.quantity}개
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                      <p className="truncate" title={as.symptom}>
                        {as.symptom}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {createdAt}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AfterServiceList;
