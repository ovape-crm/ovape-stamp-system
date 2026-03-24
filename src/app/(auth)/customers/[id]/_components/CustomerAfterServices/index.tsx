'use client';

import { useQuery } from '@tanstack/react-query';
import { getAfterServices } from '@/app/_services/afterService';
import Loading from '@/app/_components/Loading';
import { AfterServiceItemTypeEnum } from '@/app/_enums/enums';
import { useRouter } from 'next/navigation';
import { getActionText } from '@/app/_utils/utils';
import { customerKeys } from '@/app/_queryKeys/customerKeys';

interface CustomerAfterServicesProps {
  customerId: string;
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

const CustomerAfterServices = ({ customerId }: CustomerAfterServicesProps) => {
  const router = useRouter();

  const { data: afterServices = [], isPending: isLoading, isError } = useQuery({
    queryKey: customerKeys.afterServices(customerId),
    queryFn: () =>
      getAfterServices(100, 0, { customerId }) as Promise<AfterServiceType[]>,
    enabled: !!customerId,
  });

  const getStatusColor = (status: string) => {
    return getActionText(`after-service-${status}`).color;
  };

  const handleRowClick = (afterServiceId: string) => {
    router.push(`/after-services?id=${afterServiceId}`);
  };

  if (isLoading) {
    return <Loading size="lg" text="AS 목록 불러오는 중..." />;
  }

  if (isError) {
    return (
      <div className="flex justify-center items-center py-20">
        <p className="text-red-500">데이터를 불러오는데 실패했습니다.</p>
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
      (opt) => opt.value === itemType,
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
                      as.status,
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
