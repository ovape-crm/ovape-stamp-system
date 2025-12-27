'use client';

import Drawer from '@/app/_components/Drawer';
import {
  getAfterServiceDetail,
  updateAfterServiceStatus,
} from '@/services/afterService';
import { useEffect, useState } from 'react';
import { useModal } from '@/app/contexts/ModalContext';
import Loading from '@/app/_components/Loading';
import toast from 'react-hot-toast';
import AfterServiceLogList from './AfterServiceLogList';
import CustomerInfoCard from './CustomerInfoCard';
import ASInfoCard from './ASInfoCard';
import StatusBox from './StatusBox';
import SymptomCard from './SymptomCard';
import NoteCard from './NoteCard';
import UpdatedDate from './UpdatedDate';
import StatusUpdateModal from './StatusUpdateModal';
import { AfterServiceStatusEnumType } from '@/app/_enums/enums';

type AfterServiceDetailType = {
  id: string;
  customer_id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  symptom: string;
  note?: string | null;
  status: string;
  created_at: string;
  updated_at?: string;
  users: {
    name: string;
    email: string;
  } | null;
  customers: {
    name: string;
    phone: string;
  } | null;
};

const AfterServiceDetailDrawer = ({
  isOpen,
  onClose,
  afterServiceId,
}: {
  isOpen: boolean;
  onClose: () => void;
  afterServiceId: string | null;
}) => {
  const { open, close } = useModal();
  const [afterServiceDetail, setAfterServiceDetail] =
    useState<AfterServiceDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!isOpen || !afterServiceId) {
      setAfterServiceDetail(null);
      setError('');
      return;
    }

    const fetchAfterServiceDetail = async () => {
      try {
        setIsLoading(true);
        setError('');
        const detail = await getAfterServiceDetail(afterServiceId);
        setAfterServiceDetail(detail);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'AS 상세 정보를 불러오는데 실패했습니다.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchAfterServiceDetail();
  }, [isOpen, afterServiceId]);

  const handleStatusUpdate = async (values: {
    status: AfterServiceStatusEnumType['value'];
    note: string;
  }) => {
    if (!afterServiceId || !afterServiceDetail) return;

    try {
      setIsUpdatingStatus(true);
      await updateAfterServiceStatus(
        afterServiceId,
        values.status,
        values.note
      );

      // 상세 정보 새로고침
      const updated = await getAfterServiceDetail(afterServiceId);
      setAfterServiceDetail(updated);

      close();
      toast.success('상태가 업데이트되었습니다.');
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error('상태 업데이트에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleStatusEdit = () => {
    if (!afterServiceDetail) return;

    open({
      content: (
        <StatusUpdateModal
          currentStatus={afterServiceDetail.status}
          onSubmit={handleStatusUpdate}
          onCancel={close}
          isSubmitting={isUpdatingStatus}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="w-[800px]">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-brand-100">
          <h2 className="text-xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
            AS 상세
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loading size="lg" text="불러오는 중..." />
            </div>
          ) : error ? (
            <div className="flex justify-center items-center py-20">
              <p className="text-red-500">{error}</p>
            </div>
          ) : afterServiceDetail ? (
            <div className="space-y-5">
              {/* 통합 정보 섹션 */}

              <div className="bg-white border border-brand-100 rounded-lg p-6 shadow-sm">
                {/* 고객 정보 & AS 정보 */}
                <h3 className="text-lg font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent mb-4">
                  주요 정보
                </h3>
                <div className="grid grid-cols-[2fr_1fr] grid-rows-2 gap-4 mb-6">
                  {/* AS 정보 카드 */}
                  <ASInfoCard
                    itemType={afterServiceDetail.item_type}
                    itemName={afterServiceDetail.item_name}
                    quantity={afterServiceDetail.quantity}
                    createdAt={afterServiceDetail.created_at}
                    user={afterServiceDetail.users}
                  />

                  {/* Status 박스 */}
                  <StatusBox
                    status={afterServiceDetail.status}
                    onEdit={handleStatusEdit}
                  />

                  {/* 고객 정보 섹션 */}
                  <CustomerInfoCard
                    customerId={afterServiceDetail.customer_id}
                    customerName={afterServiceDetail.customers?.name}
                    customerPhone={afterServiceDetail.customers?.phone}
                    onClose={onClose}
                  />
                </div>

                {/* 증상 카드 */}
                <SymptomCard symptom={afterServiceDetail.symptom} />

                {/* 메모 (있는 경우) */}
                {afterServiceDetail.note && (
                  <NoteCard note={afterServiceDetail.note} />
                )}

                {/* 수정일 (있는 경우) */}
                {afterServiceDetail.updated_at && (
                  <UpdatedDate updatedAt={afterServiceDetail.updated_at} />
                )}
              </div>

              {/* AS 이력 */}
              <AfterServiceLogList
                afterServiceId={Number(afterServiceDetail.id)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
};

export default AfterServiceDetailDrawer;
