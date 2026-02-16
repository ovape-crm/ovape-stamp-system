'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import StampCards from './StampCards';
import { addStamp, removeStamp } from '@/services/stampService';
import { PaymentTypeEnumType } from '@/app/_enums/enums';
import { useModal } from '@/app/contexts/ModalContext';
import StampConfirmModal from '../../_components/StampConfirmModal';
import Button from '@/app/_components/Button';

interface StampSectionProps {
  stampCount: number;
  target: { id: string; name: string; phone: string };
  onUpdate: () => void;
}

const StampSection = ({ stampCount, target, onUpdate }: StampSectionProps) => {
  const [amount, setAmount] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const { open, close } = useModal();

  const handleAdd = async (
    memo?: string,
    paymentType?: PaymentTypeEnumType['value'],
  ) => {
    if (amount < 1) return;

    try {
      setIsLoading(true);
      await addStamp(target.id, amount, memo ?? '', paymentType);
      onUpdate(); // 데이터 새로고침
      toast.success(`스탬프 ${amount}개 적립 완료!`);
      setAmount(1); // 입력값 초기화
    } catch (error) {
      console.error('스탬프 적립 실패:', error);
      toast.error('스탬프 적립에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (memo?: string) => {
    if (amount < 1) return;

    try {
      setIsLoading(true);
      await removeStamp('remove', target.id, amount, memo ?? '');
      onUpdate(); // 데이터 새로고침
      toast.success(`스탬프 ${amount}개 차감 완료!`);
      setAmount(1); // 입력값 초기화
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

      <div className="mt-6 pt-6 border-t border-brand-200 space-y-3">
        {/* 입력 + 추가/제거 버튼 */}
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="개수"
            disabled={isLoading}
            className="w-full min-w-0 px-3 py-2 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent disabled:bg-gray-100"
          />
          <Button
            size="sm"
            onClick={() =>
              open({
                content: (
                  <StampConfirmModal
                    target={{
                      name: target.name,
                      phone: target.phone,
                    }}
                    mode="add"
                    amount={amount}
                    onCancel={close}
                    onConfirm={async (
                      modalNote?: string,
                      paymentType?: PaymentTypeEnumType['value'],
                    ) => {
                      await handleAdd(modalNote, paymentType);
                      close();
                    }}
                  />
                ),
                options: { dismissOnBackdrop: false },
              })
            }
            disabled={isLoading}
          >
            {isLoading ? '...' : '적립'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              open({
                content: (
                  <StampConfirmModal
                    target={{
                      name: target.name,
                      phone: target.phone,
                    }}
                    mode="remove"
                    amount={amount}
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
            {isLoading ? '...' : '차감'}
          </Button>
        </div>

        {/* 10개 사용처리 버튼 */}
        <div>
          <Button
            onClick={() =>
              open({
                content: (
                  <StampConfirmModal
                    target={{
                      name: target.name,
                      phone: target.phone,
                    }}
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
            variant="secondary"
            className="w-full"
          >
            {isLoading ? '처리 중...' : '쿠폰 사용'}
          </Button>
        </div>
      </div>
    </section>
  );
};

export default StampSection;
