'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { CustomerType } from '@/app/_domains/_customer/_types/customer.types';
import { addStamp, removeStamp } from '@/app/_domains/_stamp/_services/stampService';
import Loading from '@/app/_components/Loading';
import { useModal } from '@/app/_contexts/ModalContext';
import StampConfirmModal from '../StampConfirmModal';
import Button from '@/app/_components/Button';
import { formatPhoneNumber } from '@/app/_utils/utils';
import { LogCategoryEnum, PaymentTypeEnumType } from '@/app/_enums/enums';
import { logKeys } from '@/app/_domains/_log/_queryKeys/logKeys';
import { createLog } from '@/app/_domains/_log/_services/logService';
import RemarkLogCreateModal from '../../[id]/_components/RemarkLogCreateModal';


interface CustomerListProps {
  customers: CustomerType[];
  isLoading: boolean;
  error: string;
  onUpdate: () => void;
  loadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
  sortBy?: 'name' | 'stamp' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortBy: 'name' | 'stamp' | 'created_at') => void;
}

const CustomerList = ({
  customers,
  isLoading,
  error,
  onUpdate,
  loadMore,
  hasMore,
  isLoadingMore,
  totalCount,
  sortBy,
  onSortChange,
}: CustomerListProps) => {
  const router = useRouter();
  const { open, close } = useModal();
  const queryClient = useQueryClient();
  const [loadingCustomerId, setLoadingCustomerId] = useState<string | null>(
    null,
  );
  const handleCreateRemark = async (customerId: string, note: string) => {
    try {
      await createLog(LogCategoryEnum.REMARK.value, customerId, 'create-remark', note);
      queryClient.invalidateQueries({ queryKey: logKeys.byCustomer(customerId, LogCategoryEnum.REMARK.value) });
      toast.success('특이사항 이력이 추가되었습니다.');
    } catch {
      toast.error('특이사항 이력 추가에 실패했습니다.');
    }
  };

  const handleAdd = async (
    customerId: string,
    modalNote?: string,
    paymentType?: PaymentTypeEnumType['value'],
    amount: number = 1,
  ) => {
    try {
      setLoadingCustomerId(customerId);
      await addStamp(customerId, amount, modalNote ?? '', paymentType);
      onUpdate();
      queryClient.invalidateQueries({ queryKey: logKeys.byCustomer(customerId, 'stamp') });
      toast.success(amount === 0 ? '미적립으로 기록되었습니다.' : `스탬프 ${amount}개 적립 완료!`);
    } catch (error) {
      console.error('스탬프 적립 실패:', error);
      toast.error('스탬프 적립에 실패했습니다.');
    } finally {
      setLoadingCustomerId(null);
    }
  };

  const handleRemove = async (customerId: string, modalNote?: string) => {
    try {
      setLoadingCustomerId(customerId);
      await removeStamp('remove', customerId, 1, modalNote ?? '');
      onUpdate();
      toast.success(`스탬프 1개 차감 완료!`);
    } catch (error) {
      console.error('스탬프 차감 실패:', error);
      toast.error(
        error instanceof Error ? error.message : '스탬프 차감에 실패했습니다.',
      );
    } finally {
      setLoadingCustomerId(null);
    }
  };

  const handleUse10 = async (
    customerId: string,
    stampCount: number,
    modalNote?: string,
  ) => {
    if (stampCount < 10) {
      toast.error('스탬프가 10개 미만입니다.');
      return;
    }

    try {
      setLoadingCustomerId(customerId);
      await removeStamp('coupon', customerId, 10, modalNote ?? '');
      onUpdate();
      toast.success('쿠폰 사용 완료! 🎉');
    } catch (error) {
      console.error('쿠폰 사용 실패:', error);
      toast.error('쿠폰 사용에 실패했습니다.');
    } finally {
      setLoadingCustomerId(null);
    }
  };
  if (isLoading) {
    return <Loading size="lg" text="고객 목록 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center py-20">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="mb-10">
      <div className="flex justify-start items-center gap-3 mb-3">
        <div className="text-xs sm:text-sm text-gray-600">
          <span className="font-semibold text-brand-600">
            {customers.length}
          </span>

          {totalCount !== undefined && totalCount > 0 && (
            <>
              {' / '}
              <span className="font-semibold text-gray-600">{totalCount}</span>
            </>
          )}
        </div>
        {onSortChange && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onSortChange('name')}
              className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                sortBy === 'name'
                  ? 'bg-brand-100 border-brand-300 text-brand-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              가나다순
            </button>
            <button
              onClick={() => onSortChange('stamp')}
              className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                sortBy === 'stamp'
                  ? 'bg-brand-100 border-brand-300 text-brand-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              스탬프 많은 순
            </button>
            <button
              onClick={() => onSortChange('created_at')}
              className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                sortBy === 'created_at'
                  ? 'bg-brand-100 border-brand-300 text-brand-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              등록일 순
            </button>
          </div>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[840px] divide-y divide-brand-100 table-auto">
          <thead className="bg-gradient-to-r from-brand-50 to-brand-100">
            <tr>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                No
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                이름
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                전화번호
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                성별
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                스탬프
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-brand-700 whitespace-nowrap">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-brand-50">
            {customers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 sm:px-6 py-10 text-center text-gray-500 text-xs sm:text-sm"
                >
                  고객 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              customers.map((customer, index) => {
                const stampCount = customer.stamps?.[0]?.count || 0;
                const isThisLoading = loadingCustomerId === customer.id;

                return (
                  <tr
                    key={customer.id}
                    className="hover:bg-brand-50/50 transition-colors"
                  >
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                      {index + 1}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap">
                      {customer.name}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                      {formatPhoneNumber(customer?.phone)}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                      {customer.gender === 'male'
                        ? '남자'
                        : customer.gender === 'female'
                          ? '여자'
                          : '-'}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-semibold bg-brand-100 text-brand-700">
                        {stampCount}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-nowrap">
                        <Button
                          size="sm"
                          onClick={() => {
                            open({
                              content: (
                                <StampConfirmModal
                                  target={{
                                    name: customer.name,
                                    phone: customer.phone,
                                  }}
                                  mode="add"
                                  onCancel={close}
                                  onConfirm={async (
                                    modalNote?: string,
                                    paymentType?: PaymentTypeEnumType['value'],
                                    amount?: number,
                                  ) => {
                                    await handleAdd(
                                      customer.id,
                                      modalNote,
                                      paymentType,
                                      amount,
                                    );
                                    close();
                                  }}
                                />
                              ),
                              options: { dismissOnBackdrop: false },
                            });
                          }}
                          disabled={isThisLoading}
                        >
                          구매
                        </Button>
                        <Button
                          onClick={() =>
                            open({
                              content: (
                                <StampConfirmModal
                                  target={{
                                    name: customer.name,
                                    phone: customer.phone,
                                  }}
                                  mode="use10"
                                  onCancel={close}
                                  onConfirm={async (modalNote?: string) => {
                                    await handleUse10(
                                      customer.id,
                                      stampCount,
                                      modalNote,
                                    );
                                    close();
                                  }}
                                />
                              ),
                              options: { dismissOnBackdrop: false },
                            })
                          }
                          disabled={isThisLoading || stampCount < 10}
                          size="sm"
                          variant="tertiary"
                        >
                          쿠폰사용
                        </Button>
                        <Button
                          onClick={() =>
                            open({
                              content: (
                                <StampConfirmModal
                                  target={{
                                    name: customer.name,
                                    phone: customer.phone,
                                  }}
                                  mode="remove"
                                  onCancel={close}
                                  onConfirm={async (modalNote?: string) => {
                                    await handleRemove(customer.id, modalNote);
                                    close();
                                  }}
                                />
                              ),
                              options: { dismissOnBackdrop: false },
                            })
                          }
                          disabled={isThisLoading}
                          size="sm"
                          variant="tertiary"
                        >
                          스탬프 차감
                        </Button>
                        <Button
                          onClick={() =>
                            open({
                              content: (
                                <RemarkLogCreateModal
                                  onSubmit={async (note) => {
                                    await handleCreateRemark(customer.id, note);
                                    close();
                                  }}
                                  onCancel={close}
                                />
                              ),
                              options: { dismissOnBackdrop: false },
                            })
                          }
                          disabled={isThisLoading}
                          size="sm"
                          variant="tertiary"
                        >
                          특이사항
                        </Button>

                        <Button
                          onClick={() =>
                            router.push(`/customers/${customer.id}`)
                          }
                          disabled={isThisLoading}
                          size="sm"
                          variant="secondary"
                        >
                          상세
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {hasMore && loadMore && (
        <div className="flex justify-center mt-6">
          <Button
            size="sm"
            onClick={loadMore}
            disabled={isLoadingMore}
            variant="secondary"
          >
            {isLoadingMore ? '불러오는 중...' : '더 불러오기'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CustomerList;
