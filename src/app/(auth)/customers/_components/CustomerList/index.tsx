"use client";

import { useRouter } from "next/navigation";
import { CustomerType } from "@/app/_domains/_customer/_types/customer.types";
import Loading from "@/app/_components/Loading";
import Button from "@/app/_components/Button";
import { formatPhoneNumber } from "@/app/_utils/utils";

interface CustomerListProps {
  customers: CustomerType[];
  isLoading: boolean;
  error: string;
  onUpdate: () => void;
  loadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
  sortBy?: "recent_usage" | "name" | "stamp" | "created_at" | "all";
  sortOrder?: "asc" | "desc";
  onSortChange?: (
    sortBy: "recent_usage" | "name" | "stamp" | "created_at" | "all",
  ) => void;
  headerActions?: React.ReactNode;
}

const CustomerList = ({
  customers,
  isLoading,
  error,
  loadMore,
  hasMore,
  isLoadingMore,
  totalCount,
  sortBy,
  onSortChange,
  headerActions,
}: CustomerListProps) => {
  const router = useRouter();
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 lg:flex-nowrap">
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-3">
          <div className="text-xs text-gray-600 sm:text-sm">
            <span className="font-semibold text-brand-600">
              {customers.length}
            </span>

            {totalCount !== undefined && totalCount > 0 && (
              <>
                {" / "}
                <span className="font-semibold text-gray-600">
                  {totalCount}
                </span>
              </>
            )}
          </div>
          {onSortChange && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => onSortChange("recent_usage")}
                className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                  sortBy === "recent_usage"
                    ? "bg-brand-100 border-brand-300 text-brand-700 font-medium"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                최근 이용순
              </button>
              <button
                onClick={() => onSortChange("name")}
                className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                  sortBy === "name"
                    ? "bg-brand-100 border-brand-300 text-brand-700 font-medium"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                가나다순
              </button>
              <button
                onClick={() => onSortChange("stamp")}
                className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                  sortBy === "stamp"
                    ? "bg-brand-100 border-brand-300 text-brand-700 font-medium"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                스탬프 많은 순
              </button>
              <button
                onClick={() => onSortChange("created_at")}
                className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                  sortBy === "created_at"
                    ? "bg-brand-100 border-brand-300 text-brand-700 font-medium"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                등록일 순
              </button>
              <button
                onClick={() => onSortChange("all")}
                className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors cursor-pointer ${
                  sortBy === "all"
                    ? "bg-brand-100 border-brand-300 text-brand-700 font-medium"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                전체
              </button>
            </div>
          )}
        </div>
        {headerActions && (
          <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end lg:w-auto">
            {headerActions}
          </div>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-brand-100 overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[720px] table-auto border-collapse lg:min-w-[840px] [&_th]:border [&_th]:border-brand-200 [&_th]:sm:px-3 [&_th]:lg:px-6 [&_td]:border [&_td]:border-gray-200 [&_td]:sm:px-3 [&_td]:lg:px-6">
          <thead className="bg-gradient-to-r from-brand-50 to-brand-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-brand-700 whitespace-nowrap sm:py-3 sm:text-sm lg:px-6">
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
                const isNoStampCustomer =
                  customer.name.trim() === "X" && customer.phone.trim() === "X";
                const stampCount = isNoStampCustomer
                  ? 0
                  : customer.stamps?.[0]?.count || 0;

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
                      {customer.name.trim() === "시연용"
                        ? "시연용"
                        : customer.name.trim() === "재고조정"
                          ? "재고조정"
                          : customer.gender === "male"
                            ? "남자"
                            : customer.gender === "female"
                              ? "여자"
                              : "-"}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-semibold bg-brand-100 text-brand-700">
                        {customer.is_stamp_eligible === false
                          ? "미적립"
                          : stampCount}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap">
                      <div className="flex items-center justify-center">
                        <Button
                          onClick={() =>
                            router.push(`/customers/${customer.id}`)
                          }
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
            {isLoadingMore ? "불러오는 중..." : "더 불러오기"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CustomerList;
