'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import StampCards from './StampCards';
import { addStamp, removeStamp } from '@/app/_services/stampService';
import { PaymentTypeEnumType } from '@/app/_enums/enums';
import { useModal } from '@/app/_contexts/ModalContext';
import StampConfirmModal from '../../_components/StampConfirmModal';
import Button from '@/app/_components/Button';

interface StampSectionProps {
  stampCount: number;
  target: { id: string; name: string; phone: string };
  onUpdate: () => void;
  onAddRemark: () => void;
}

const StampSection = ({ stampCount, target, onUpdate, onAddRemark }: StampSectionProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { open, close } = useModal();

  const handleAdd = async (
    memo?: string,
    paymentType?: PaymentTypeEnumType['value'],
    amount: number = 0,
  ) => {
    try {
      setIsLoading(true);
      await addStamp(target.id, amount, memo ?? '', paymentType);
      onUpdate();
      toast.success(amount === 0 ? '미적립으로 기록되었습니다.' : `스탬프 ${amount}개 적립 완료!`);
    } catch (error) {
      console.error('스탬프 적립 실패:', error);
      toast.error('스탬프 적립에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (memo?: string) => {
    try {
      setIsLoading(true);
      await removeStamp('remove', target.id, 1, memo ?? '');
      onUpdate();
      toast.success(`스탬프 1개 차감 완료!`);
    } catch (error) {
      console.error('스탬프 차감 실패:', error);
      toast.error(
        error instanceof Error ? error.message : '스탬프 차감에 실패했습니다.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUse10 = async (memo?: string) => {
    if (stampCount < 10) {
      toast.error('스탬프가 10개 미만입니다.');
      return;
    }

    try {
      setIsLoading(true);
      await removeStamp('coupon', target.id, 10, memo ?? '');
      onUpdate();
      toast.success('쿠폰 사용 완료! 🎉');
    } catch (error) {
      console.error('쿠폰 사용 실패:', error);
      toast.error('쿠폰 사용에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="flex-1 h-full bg-gradient-to-br from-brand-50 to-brand-100 rounded-lg shadow-sm border border-brand-200 p-6">
      <h2 className="text-xl font-semibold text-brand-700 mb-6 pb-3 border-b border-brand-200">
        스탬프 현황
      </h2>

      <StampCards count={stampCount} />

      <div className="mt-6 pt-6 border-t border-brand-200">
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() =>
              open({
                content: (
                  <StampConfirmModal
                    target={{ name: target.name, phone: target.phone }}
                    mode="add"
                    onCancel={close}
                    onConfirm={async (
                      modalNote?: string,
                      paymentType?: PaymentTypeEnumType['value'],
                      amount?: number,
                    ) => {
                      await handleAdd(modalNote, paymentType, amount);
                      close();
                    }}
                  />
                ),
                options: { dismissOnBackdrop: false },
              })
            }
            disabled={isLoading}
          >
            구매
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            className="flex-1"
            onClick={() =>
              open({
                content: (
                  <StampConfirmModal
                    target={{ name: target.name, phone: target.phone }}
                    mode="use10"
                    onCancel={close}
                    onConfirm={async (modalNote?: string) => {
                      await handleUse10(modalNote);
                      close();
                    }}
                  />
                ),
                options: { dismissOnBackdrop: false },
              })
            }
            disabled={isLoading || stampCount < 10}
          >
            쿠폰사용
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            className="flex-1"
            onClick={() =>
              open({
                content: (
                  <StampConfirmModal
                    target={{ name: target.name, phone: target.phone }}
                    mode="remove"
                    onCancel={close}
                    onConfirm={async (modalNote?: string) => {
                      await handleRemove(modalNote);
                      close();
                    }}
                  />
                ),
                options: { dismissOnBackdrop: false },
              })
            }
            disabled={isLoading}
          >
            스탬프 차감
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={onAddRemark}
            disabled={isLoading}
          >
            특이사항
          </Button>
        </div>
      </div>
    </section>
  );
};

export default StampSection;
