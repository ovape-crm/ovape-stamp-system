'use client';

import { useState } from 'react';
import Button from '@/app/_components/Button';
import { useModal } from '@/app/contexts/ModalContext';
import AfterServiceCreateModal from './_components/AfterServiceCreateModal';
import AfterServiceList from './_components/AfterServiceList';
import { createAfterService } from '@/services/afterService';
import toast from 'react-hot-toast';
import { AfterServiceItemTypeEnumType } from '@/app/_enums/enums';

const AfterServicesPage = () => {
  const { open, close } = useModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ========================================================================
  // AS 생성 핸들러
  // ========================================================================
  const handleAfterServiceSubmit = async (values: {
    customerId: string;
    itemType: AfterServiceItemTypeEnumType['value'];
    itemName: string;
    quantity: number;
    symptom: string;
    note?: string;
  }) => {
    try {
      setIsSubmitting(true);

      await createAfterService({
        customerId: values.customerId,
        itemType: values.itemType,
        itemName: values.itemName,
        quantity: values.quantity,
        symptom: values.symptom,
        note: values.note,
      });

      toast.success('AS가 등록되었습니다.');
      close();
      // AS 목록 새로고침
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      console.error('AS 등록 실패:', err);
      toast.error(
        err instanceof Error ? err.message : 'AS 등록에 실패했습니다.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
        <h2 className="text-xl font-bold text-brand-700">AS 현황</h2>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setIsSubmitting(false);
            open({
              content: (
                <AfterServiceCreateModal
                  onCancel={close}
                  isSubmitting={isSubmitting}
                  onSubmit={handleAfterServiceSubmit}
                />
              ),
              options: { dismissOnBackdrop: false, dismissOnEsc: true },
            });
          }}
        >
          AS 생성
        </Button>
      </div>

      {/* AS 목록 */}
      <AfterServiceList refreshKey={refreshKey} />
    </div>
  );
};

export default AfterServicesPage;
