"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomer } from "@/app/_domains/_customer/_hooks/useCustomer";
import { useLogsByCustomerId } from "@/app/_domains/_log/_hooks/useLogsByCustomerId";
import NotFoundView from "@/app/_components/NotFoundView";
import CustomerInfo from "./_components/CustomerInfo";
import StampSection from "./_components/StampSection";
import CustomerEditModal from "./_components/CustomerEditModal";
import Loading from "@/app/_components/Loading";
import toast from "react-hot-toast";
import { useModal } from "@/app/_contexts/ModalContext";
import {
  deleteCustomer,
  updateCustomerWithAdultVerification,
} from "@/app/_domains/_customer/_services/customerService";
import Button from "@/app/_components/Button";
import { useUser } from "@/app/_contexts/UserContext";
import { useState } from "react";
import { LogCategoryEnum, LogCategoryEnumType } from "@/app/_enums/enums";
import CustomersDetailStampsHistories from "./_components/CustomersDetailStampsHistories";
import CustomersDetailUpdateHistories from "./_components/CustomersDetailUpdateHistories";
// import CustomersDetailRemarkHistories from './_components/CustomersDetailRemarkHistories';
import CustomerAfterServices from "./_components/CustomerAfterServices";
import RemarkLogCreateModal from "./_components/RemarkLogCreateModal";
import {
  addStamp,
  confirmReservationStamp,
} from "@/app/_domains/_stamp/_services/stampService";
// import { createLog } from '@/app/_domains/_log/_services/logService';
import { PaymentTypeEnum } from "@/app/_enums/enums";
import { customerKeys } from "@/app/_domains/_customer/_queryKeys/customerKeys";
import { logKeys } from "@/app/_domains/_log/_queryKeys/logKeys";
import { isSpecialCustomer as checkSpecialCustomer } from "@/app/_domains/_customer/_utils/specialCustomer";

const PAGE_SIZE = 10;

export default function CustomerDetailPage() {
  const { isAdmin, user } = useUser();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = params.id as string;
  const { open, close } = useModal();
  const queryClient = useQueryClient();
  const { customer, isLoading, error } = useCustomer(customerId);

  const [logCategory, setLogCategory] = useState<LogCategoryEnumType["value"]>(
    LogCategoryEnum.STAMP.value,
  );

  const {
    logs,
    isLoading: logsLoading,
    error: logsError,
    loadMore,
    hasMore,
    removeItem: removeLog,
    updateItem: updateLog,
  } = useLogsByCustomerId(customerId, PAGE_SIZE, logCategory);

  // const {
  //   logs: remarkLogs,
  //   isLoading: remarkLogsLoading,
  //   error: remarkLogsError,
  //   loadMore: loadMoreRemarks,
  //   hasMore: hasMoreRemarks,
  //   removeItem: removeRemarkLog,
  // } = useLogsByCustomerId(customerId, PAGE_SIZE, LogCategoryEnum.REMARK.value);

  const handleUpdate = () => {
    queryClient.invalidateQueries({
      queryKey: customerKeys.detail(customerId),
    });
    queryClient.invalidateQueries({
      queryKey: logKeys.byCustomer(customerId, logCategory),
    });
    queryClient.invalidateQueries({
      queryKey: logKeys.byCustomer(customerId, LogCategoryEnum.REMARK.value),
    });
    queryClient.invalidateQueries({
      queryKey: logKeys.lists(),
    });
    queryClient.invalidateQueries({
      queryKey: customerKeys.afterServices(customerId),
    });
  };

  const handleEditCustomer = async (values: {
    name: string;
    phone: string;
    gender: "male" | "female";
    is_stamp_eligible: boolean;
    adult_verification_method: "" | "physical_id" | "bbaton";
    adult_verification_request_id?: string;
    address?: string;
    note?: string;
  }) => {
    try {
      const {
        adult_verification_method,
        adult_verification_request_id,
        ...customerUpdates
      } = values;
      await updateCustomerWithAdultVerification(customerId, customerUpdates, {
        method: adult_verification_method as "physical_id" | "bbaton",
        requestId: adult_verification_request_id,
      });
      toast.success("고객 정보가 수정되었습니다.");
      close();
      handleUpdate();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.message === "DUPLICATE_CUSTOMER") {
        toast.error("이미 존재하는 전화번호입니다.");
      } else {
        toast.error("고객 정보 수정에 실패했습니다.");
      }
    }
  };

  const handleDeleteCustomer = async () => {
    if (!isAdmin) {
      return;
    }
    try {
      await deleteCustomer(customerId);
      toast.success("고객 정보가 삭제되었습니다.");
      close();
      router.push("/customers");
      handleUpdate();
    } catch {
      toast.error("고객 정보 삭제에 실패했습니다.");
    }
  };

  const handleConfirmReservation = async (logId: string) => {
    await confirmReservationStamp(logId);
    // 확정 시 스탬프 개수 및 출고/예약 이력(고객 상세 탭 + 이력 페이지) 갱신
    queryClient.invalidateQueries({
      queryKey: customerKeys.detail(customerId),
    });
    queryClient.invalidateQueries({
      queryKey: logKeys.byCustomerAll(customerId),
    });
    queryClient.invalidateQueries({
      queryKey: logKeys.lists(),
    });
  };

  const handleCreateRemarkLog = async (note: string) => {
    try {
      await addStamp(customerId, 0, note, PaymentTypeEnum.REMARK.value);
      toast.success("특이사항이 추가되었습니다.");
      close();
      handleUpdate();
    } catch (error) {
      console.error("Failed to create remark log:", error);
      toast.error("특이사항 추가에 실패했습니다.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loading size="lg" text="고객 정보 불러오는 중..." />
      </div>
    );
  }

  if (error || !customer) {
    return <NotFoundView full={false} />;
  }

  const stampCount =
    customer.name.trim() === "X" && customer.phone.trim() === "X"
      ? 0
      : customer.stamps?.[0]?.count || 0;
  const isSpecialCustomer = checkSpecialCustomer(
    customer.name,
    customer.phone,
    customer.is_stamp_eligible ?? true,
  );
  if (customer.name.trim() === "재고조정" && user?.oss_role !== "master") {
    return <NotFoundView full={false} />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-brand-600 to-brand-700 bg-clip-text text-transparent">
          고객 상세
        </h1>
        <Button onClick={() => router.push("/customers")} variant="tertiary">
          ← 목록으로
        </Button>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 mb-6 items-stretch">
        <div className="flex-1 self-stretch">
          <CustomerInfo
            customer={customer}
            onEdit={() => {
              if (customer) {
                open({
                  content: (
                    <CustomerEditModal
                      isAdmin={isAdmin}
                      customer={customer}
                      onSubmit={handleEditCustomer}
                      onDelete={handleDeleteCustomer}
                      onCancel={close}
                    />
                  ),
                  options: { dismissOnBackdrop: false, dismissOnEsc: true },
                });
              }
            }}
          />
        </div>
        <div className="flex-1 self-stretch">
          <StampSection
            stampCount={stampCount}
            autoOpenOutbound={searchParams.get("openOutbound") === "1"}
            onAutoOpenHandled={() =>
              router.replace(`/customers/${customerId}`, { scroll: false })
            }
            target={{
              id: customerId,
              name: customer.name,
              phone: customer.phone,
              address: customer.address,
              gender: customer.gender,
              is_stamp_eligible: customer.is_stamp_eligible,
              note: customer.note,
            }}
            onUpdate={handleUpdate}
            onAddRemark={() =>
              open({
                content: (
                  <RemarkLogCreateModal
                    onSubmit={handleCreateRemarkLog}
                    onCancel={close}
                  />
                ),
                options: { dismissOnBackdrop: false, dismissOnEsc: true },
              })
            }
          />
        </div>
      </div>

      {/* 로그 섹션 */}
      <div className="mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-4">
          <div className="mb-3 pb-2 border-b border-brand-100 flex gap-2 text-xs">
            <Button
              variant={
                logCategory === LogCategoryEnum.STAMP.value
                  ? "primary"
                  : "secondary"
              }
              size="sm"
              onClick={() => setLogCategory(LogCategoryEnum.STAMP.value)}
            >
              출고 이력
            </Button>
            {!isSpecialCustomer && (
              <Button
                variant={
                  logCategory === LogCategoryEnum.RESERVATION.value
                    ? "primary"
                    : "secondary"
                }
                size="sm"
                onClick={() =>
                  setLogCategory(LogCategoryEnum.RESERVATION.value)
                }
              >
                예약 이력
              </Button>
            )}
            {/* <Button
              variant={logCategory === LogCategoryEnum.REMARK.value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setLogCategory(LogCategoryEnum.REMARK.value)}
            >
              특이사항
            </Button> */}
            {!isSpecialCustomer && (
              <Button
                variant={
                  logCategory === LogCategoryEnum.CUSTOMER.value
                    ? "primary"
                    : "secondary"
                }
                size="sm"
                onClick={() => setLogCategory(LogCategoryEnum.CUSTOMER.value)}
              >
                고객 이력
              </Button>
            )}
          </div>
          <div className="space-y-2.5">
            {(logCategory === LogCategoryEnum.STAMP.value ||
              logCategory === LogCategoryEnum.RESERVATION.value) && (
              <CustomersDetailStampsHistories
                targetUser={{
                  phone: customer.phone,
                  name: customer.name,
                  gender: customer.gender,
                  is_stamp_eligible: customer.is_stamp_eligible,
                  address: customer.address,
                  note: customer.note,
                }}
                logs={logs}
                isLoading={logsLoading}
                error={logsError}
                isAdmin={isAdmin}
                onDeleteLog={removeLog}
                onUpdateLog={updateLog}
                isReservation={
                  logCategory === LogCategoryEnum.RESERVATION.value
                }
                onConfirmReservation={handleConfirmReservation}
              />
            )}
            {logCategory === LogCategoryEnum.CUSTOMER.value && (
              <CustomersDetailUpdateHistories
                logs={logs}
                isLoading={logsLoading}
                error={logsError}
                isAdmin={isAdmin}
                onDeleteLog={removeLog}
              />
            )}
          </div>
        </div>
        {logCategory !== LogCategoryEnum.REMARK.value &&
          hasMore &&
          !logsLoading && (
            <div className="mt-4 flex justify-center">
              <Button
                onClick={async () => {
                  const added = await loadMore();
                  if (added > 0) toast.success(`${added}개 더 불러오기 성공!`);
                }}
                variant="secondary"
                size="sm"
              >
                더 불러오기
              </Button>
            </div>
          )}
        {/* {logCategory === LogCategoryEnum.REMARK.value &&
          hasMoreRemarks &&
          !remarkLogsLoading && (
            <div className="mt-4 flex justify-center">
              <Button
                onClick={async () => {
                  const added = await loadMoreRemarks();
                  if (added > 0) toast.success(`${added}개 더 불러오기 성공!`);
                }}
                variant="secondary"
                size="sm"
              >
                더 불러오기
              </Button>
            </div>
          )} */}
      </div>

      {/* AS 현황 섹션 */}
      {!isSpecialCustomer && (
        <div className="mb-10">
          <div className="bg-white rounded-lg shadow-sm border border-brand-100 p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-brand-700 mb-4">
              AS 현황
            </h2>
            <CustomerAfterServices customerId={customerId} />
          </div>
        </div>
      )}
    </div>
  );
}
