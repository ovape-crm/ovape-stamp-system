"use client";

import { useState, useCallback } from "react";
import {
  LogCategoryEnum,
  LogCategoryEnumType,
  PaymentTypeEnum,
  PaymentTypeEnumType,
  StoreTypeEnumType,
} from "@/app/_enums/enums";
import {
  updateLogNote,
  deleteLog,
} from "@/app/_domains/_log/_services/logService";
import { confirmReservationStamp } from "@/app/_domains/_stamp/_services/stampService";
import { useQueryClient } from "@tanstack/react-query";
import { logKeys } from "@/app/_domains/_log/_queryKeys/logKeys";
import { customerKeys } from "@/app/_domains/_customer/_queryKeys/customerKeys";
import Loading from "@/app/_components/Loading";
import Button from "@/app/_components/Button";
import { Dropdown, DropdownOption } from "@/app/_components/Dropdown";
import DateRangePicker from "@/app/_components/DateRangePicker";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { LogsResType } from "@/app/_domains/_log/_types/log.types";
import useLogs from "@/app/_domains/_log/_hooks/useLogs";
import { groupLogsByDate, formatDateKey } from "@/app/_utils/utils";
import StampHistoryItem from "./StampHistoryItem";
import { useUser } from "@/app/_contexts/UserContext";
import { useModal } from "@/app/_contexts/ModalContext";
import DeleteConfirmModal from "@/app/(auth)/_components/DeleteConfirmModal";
import StampLogEditModal from "@/app/(auth)/_components/StampLogEditModal";
import ConfirmModal from "@/app/(auth)/_components/ConfirmModal";
import RemarkLogCreateModal from "@/app/(auth)/customers/[id]/_components/RemarkLogCreateModal";
import type { StampLogMeta } from "@/app/_domains/_stamp/_services/stampService";

const PAGE_SIZE = 10;

const paymentMethodOptions = [
  { label: "전체", value: "" },
  ...Object.values(PaymentTypeEnum).map((p) => ({
    label: p.name,
    value: p.value,
  })),
];

interface StampHistoriesProps {
  category?: LogCategoryEnumType["value"];
  isReservation?: boolean;
}

const StampHistories = ({
  category = LogCategoryEnum.STAMP.value,
  isReservation = false,
}: StampHistoriesProps = {}) => {
  const router = useRouter();
  const { isAdmin } = useUser();
  const { open, close } = useModal();
  const queryClient = useQueryClient();

  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  const dateRange =
    startDate && endDate ? { start: startDate, end: endDate } : null;

  const { items, updateItem, removeItem, isLoading, error, hasMore, load } =
    useLogs(
      PAGE_SIZE,
      category,
      dateRange,
      paymentMethod || null,
      searchKeyword || null,
    );

  const handleSearch = () => {
    setSearchKeyword(searchInput.trim());
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") handleSearch();
  };

  const startEdit = useCallback(
    (log: LogsResType) => {
      const isRemarkLog =
        log.jsonb?.paymentType === PaymentTypeEnum.REMARK.value;
      const hasStampLogItems =
        Array.isArray(log.jsonb?.items) && log.jsonb.items.length > 0;
      const shouldEditMemoOnly = isRemarkLog || !hasStampLogItems;

      if (shouldEditMemoOnly) {
        const handleRemarkSubmit = async (note: string) => {
          try {
            const updated = await updateLogNote(log.id, note);
            updateItem(log.id, (item) => ({
              ...item,
              note: updated.note,
              jsonb: updated.jsonb,
              updated_at: updated.updated_at,
            }));
            close();
            toast.success(
              isRemarkLog ? "특이사항을 저장했습니다." : "메모를 저장했습니다.",
            );
          } catch (e) {
            console.error("Failed to save note:", e);
            toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
          }
        };

        open({
          content: (
            <RemarkLogCreateModal
              initialNote={log.note ?? ""}
              mode="edit"
              title={isRemarkLog ? undefined : "메모 수정"}
              label={isRemarkLog ? undefined : "메모"}
              placeholder={isRemarkLog ? undefined : "메모를 입력하세요"}
              onSubmit={handleRemarkSubmit}
              onCancel={close}
            />
          ),
          options: { dismissOnBackdrop: false, dismissOnEsc: true },
        });
        return;
      }

      const handleSubmit = async (values: {
        note: string;
        paymentType?: PaymentTypeEnumType["value"];
        storeName: StoreTypeEnumType["value"];
        logMeta: StampLogMeta;
        amount: number;
      }) => {
        try {
          // 예약 이력은 아직 스탬프가 적립되지 않았으므로 개수 수정 허용
          const nextAction = isReservation
            ? values.amount === 0
              ? "no-stamp"
              : `add-${values.amount}`
            : undefined;
          const updated = await updateLogNote(
            log.id,
            values.note,
            values.paymentType,
            values.storeName,
            values.logMeta,
            nextAction,
          );
          updateItem(log.id, (item) => ({
            ...item,
            action: updated.action,
            note: updated.note,
            jsonb: updated.jsonb,
            updated_at: updated.updated_at,
          }));
          close();
          toast.success("이력을 저장했습니다.");
        } catch (e) {
          console.error("Failed to save note:", e);
          toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
        }
      };

      open({
        content: (
          <StampLogEditModal
            target={{
              name: log.customers.name,
              phone: log.customers.phone,
              address: log.customers.address,
              note: log.customers.note,
              is_stamp_eligible: log.customers.is_stamp_eligible,
            }}
            initialAction={log.action}
            initialPaymentType={
              log.jsonb?.paymentType as PaymentTypeEnumType["value"] | undefined
            }
            initialStoreName={
              log.jsonb?.storeName as StoreTypeEnumType["value"] | undefined
            }
            initialLogMeta={log.jsonb as StampLogMeta}
            isStampAmountEditable={isReservation}
            title={isReservation ? "출고 예약 수정" : "출고 이력 수정"}
            onSubmit={handleSubmit}
            onCancel={close}
          />
        ),
        options: { dismissOnBackdrop: false, dismissOnEsc: true },
      });
    },
    [open, close, updateItem, isReservation],
  );

  const deleteItem = useCallback(
    (log: LogsResType) => {
      const handleConfirm = async () => {
        try {
          await deleteLog(log.id);
          removeItem(log.id);
          close();
          toast.success("로그를 삭제했습니다.");
        } catch (e) {
          console.error("Failed to delete log:", e);
          toast.error("로그 삭제에 실패했습니다. 다시 시도해 주세요.");
          close();
        }
      };

      open({
        content: (
          <DeleteConfirmModal onConfirm={handleConfirm} onCancel={close} />
        ),
        options: { dismissOnBackdrop: false },
      });
    },
    [removeItem, open, close],
  );

  const confirmReservation = useCallback(
    (log: LogsResType) => {
      const handleConfirm = async () => {
        try {
          await confirmReservationStamp(log.id);
          removeItem(log.id);
          // 이력 페이지 목록 + 고객 상세 탭(출고/예약) + 스탬프 개수를 모두 무효화
          queryClient.invalidateQueries({ queryKey: logKeys.lists() });
          if (log.customer_id) {
            queryClient.invalidateQueries({
              queryKey: logKeys.byCustomerAll(log.customer_id),
            });
            queryClient.invalidateQueries({
              queryKey: customerKeys.detail(log.customer_id),
            });
          }
          close();
          toast.success("출고 이력으로 확정되었습니다.");
        } catch (e) {
          console.error("Failed to confirm reservation:", e);
          toast.error("출고 확정에 실패했습니다. 다시 시도해 주세요.");
          close();
        }
      };

      open({
        content: (
          <ConfirmModal
            title="출고 확정"
            description={
              "이 예약을 출고 이력으로 확정하시겠습니까?\n확정 시 스탬프가 적립되고 출고 이력으로 이동합니다."
            }
            confirmLabel="출고 확정"
            confirmingLabel="확정 중..."
            onConfirm={handleConfirm}
            onCancel={close}
          />
        ),
        options: { dismissOnBackdrop: false },
      });
    },
    [removeItem, open, close, queryClient],
  );

  const { itemsByDate, sortedDates } = groupLogsByDate(items);

  return (
    <>
      <div className="flex flex-col gap-3 mb-4 pb-3 border-b border-brand-100 text-xs sm:text-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 sm:gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-gray-600">기간</label>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChangeStart={setStartDate}
              onChangeEnd={setEndDate}
              onReset={() => {
                setStartDate(null);
                setEndDate(null);
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-gray-600">결제 방식</label>
            <div className="w-full sm:w-[180px]">
              <Dropdown controlledValue={paymentMethod}>
                <Dropdown.Trigger>
                  {paymentMethodOptions.find((o) => o.value === paymentMethod)
                    ?.label ?? "전체"}
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {paymentMethodOptions.map((option, i) => (
                    <Dropdown.Item
                      key={`pm-${i}-${option.value}`}
                      option={option}
                      onSelect={(o: DropdownOption) =>
                        setPaymentMethod(String(o.value))
                      }
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="내용 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="flex-1 px-3 py-1.5 sm:px-4 sm:py-2 border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent text-xs sm:text-sm"
          />
          <Button onClick={handleSearch} size="sm">
            검색
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-center py-8 text-rose-600 text-xs sm:text-sm">
          {error}
        </div>
      )}

      {items.length === 0 && !isLoading ? (
        <div className="text-center py-12 text-gray-500 text-xs sm:text-sm">
          데이터가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="w-full min-w-[960px] space-y-4 text-xs sm:space-y-6 sm:text-sm">
            {sortedDates.map((dateKey) => {
              const logsOfDate = itemsByDate[dateKey];

              const prettyDate = formatDateKey(dateKey);

              return (
                <div key={dateKey} className="space-y-4">
                  {/* 날짜 헤더 */}
                  <div className="w-full py-0.5 sm:py-1">
                    <div className="w-full px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-brand-50/80 border border-brand-100 shadow-xs flex items-center justify-start sm:justify-center">
                      <span className="text-xs sm:text-sm font-semibold text-brand-800 tracking-wide whitespace-nowrap">
                        {prettyDate}
                      </span>
                    </div>
                  </div>

                  {/* 해당 날짜 로그들 */}
                  <div className="space-y-3">
                    {logsOfDate.map((log) => (
                      <StampHistoryItem
                        key={log.id}
                        log={log}
                        onEdit={() => startEdit(log)}
                        onNavigate={() =>
                          router.push(`/customers/${log.customer_id}`)
                        }
                        isAdmin={isAdmin}
                        onDelete={() => deleteItem(log)}
                        onConfirm={
                          isReservation
                            ? () => confirmReservation(log)
                            : undefined
                        }
                        showCopy={!isReservation}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-center">
        {isLoading ? (
          <Loading size="sm" text="불러오는 중..." />
        ) : hasMore ? (
          <Button onClick={() => void load()} variant="secondary" size="sm">
            더 불러오기
          </Button>
        ) : (
          <div className="text-xs text-gray-400">마지막 페이지입니다.</div>
        )}
      </div>
    </>
  );
};

export default StampHistories;
