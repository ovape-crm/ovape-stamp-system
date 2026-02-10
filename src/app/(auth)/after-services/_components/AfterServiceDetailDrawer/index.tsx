'use client';

import Drawer from '@/app/_components/Drawer';
import {
  getAfterServiceDetail,
  updateAfterServiceStatus,
  updateAfterService,
  deleteAfterService,
} from '@/services/afterService';
import { useEffect, useState } from 'react';
import { useModal } from '@/app/contexts/ModalContext';
import { useUser } from '@/app/contexts/UserContext';
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
import AfterServiceCreateModal from '../AfterServiceCreateModal';
import {
  AfterServiceStatusEnumType,
  AfterServiceItemTypeEnumType,
} from '@/app/_enums/enums';
import Button from '@/app/_components/Button';

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
  onRefreshList,
  onDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  afterServiceId: string | null;
  onRefreshList?: () => void;
  onDelete?: () => void;
}) => {
  const { open, close } = useModal();
  const { isAdmin } = useUser();
  const [afterServiceDetail, setAfterServiceDetail] =
    useState<AfterServiceDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

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

      // 로그 목록 새로고침
      setLogRefreshKey((prev) => prev + 1);

      // AS 목록 새로고침
      if (onRefreshList) {
        onRefreshList();
      }

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

  const handleDelete = async () => {
    if (!afterServiceId) return;

    try {
      setIsDeleting(true);
      await deleteAfterService(afterServiceId);
      toast.success('AS가 삭제되었습니다.');
      close();
      // AS 목록 새로고침
      if (onRefreshList) {
        onRefreshList();
      }
      // Drawer 닫기 (부모 컴포넌트에서 처리)
      if (onDelete) {
        onDelete();
      }
    } catch (err) {
      console.error('Failed to delete AS:', err);
      toast.error('AS 삭제에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = () => {
    if (!afterServiceDetail) return;

    open({
      content: (
        <AfterServiceCreateModal
          mode="edit"
          initialData={{
            customerId: afterServiceDetail.customer_id,
            customerName: afterServiceDetail.customers?.name || null,
            customerPhone: afterServiceDetail.customers?.phone || null,
            itemType:
              afterServiceDetail.item_type as AfterServiceItemTypeEnumType['value'],
            itemName: afterServiceDetail.item_name,
            quantity: afterServiceDetail.quantity,
            symptom: afterServiceDetail.symptom,
            note: afterServiceDetail.note || undefined,
          }}
          onSubmit={async (values) => {
            if (!afterServiceId) return;
            try {
              setIsUpdating(true);
              await updateAfterService(afterServiceId, {
                customerId: values.customerId || null,
                itemType: values.itemType,
                itemName: values.itemName,
                quantity: values.quantity,
                symptom: values.symptom,
                note: values.note,
              });
              toast.success('AS 정보가 수정되었습니다.');
              close();
              // 상세 정보 새로고침
              const updated = await getAfterServiceDetail(afterServiceId);
              setAfterServiceDetail(updated);

              // 로그 목록 새로고침
              setLogRefreshKey((prev) => prev + 1);

              // AS 목록 새로고침
              if (onRefreshList) {
                onRefreshList();
              }
            } catch (err) {
              console.error('Failed to update AS:', err);
              toast.error('AS 수정에 실패했습니다. 다시 시도해 주세요.');
            } finally {
              setIsUpdating(false);
            }
          }}
          onDelete={handleDelete}
          onCancel={close}
          isSubmitting={isUpdating || isDeleting}
          isAdmin={isAdmin}
        />
      ),
      options: { dismissOnBackdrop: false, dismissOnEsc: true },
    });
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="w-full sm:w-[800px]">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-brand-100">
          <h2 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
            AS 상세
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6"
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loading size="lg" text="불러오는 중..." />
            </div>
          ) : error ? (
            <div className="flex justify-center items-center py-20">
              <p className="text-red-500">{error}</p>
            </div>
          ) : afterServiceDetail ? (
            <div className="space-y-4 sm:space-y-5 text-xs sm:text-sm">
              {/* 통합 정보 섹션 */}

              <div className="bg-white border border-brand-100 rounded-lg p-4 sm:p-6 shadow-sm">
                {/* 고객 정보 & AS 정보 */}
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-base sm:text-lg font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
                    주요 정보
                  </h3>
                  <Button
                    onClick={handleEdit}
                    variant="secondary"
                    size="sm"
                    aria-label="AS 정보 수정"
                  >
                    ✏️
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] sm:grid-rows-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
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
                refreshKey={logRefreshKey}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
};

export default AfterServiceDetailDrawer;
