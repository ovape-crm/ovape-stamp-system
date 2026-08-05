"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AfterServiceStatusEnum } from "@/app/_enums/enums";
import { getAfterServiceStatusGroups } from "@/app/_utils/utils";
import { getCurrentWorkerName } from "@/app/_domains/_workJournal/_utils/currentWorker";
import { useUser } from "@/app/_contexts/UserContext";
import supabase from "@/libs/supabaseClient";

type ReservationRow = {
  id: string;
  note: string | null;
  jsonb: Record<string, unknown> | null;
  customers: { name: string; phone: string } | null;
};

type AfterServiceRow = {
  id: string;
  item_name: string;
  status: string;
  customer_note: string | null;
  shop_note: string | null;
  customers: { name: string; phone: string } | null;
};

type PurchaseOrderRow = {
  id: string;
  status: string;
  inventory_suppliers: { name: string } | null;
  inventory_purchase_order_lines: Array<{
    pending_quantity: number;
  }>;
};

type HandoverMemo = {
  id: string;
  content: string;
  author_name: string;
  created_at: string;
  is_completed: boolean;
  completed_at: string | null;
  completed_by_name: string | null;
};

const getRelation = <T,>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

const formatReservationItems = (jsonb: Record<string, unknown> | null) => {
  const items = Array.isArray(jsonb?.items)
    ? (jsonb.items as Array<{ itemName?: string; quantity?: number }>)
    : [];
  if (!items.length) return "예약 품목 확인";
  const quantity = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  return `${items[0].itemName ?? "품목"}${items.length > 1 ? ` 외 ${items.length - 1}종` : ""} · 총 ${quantity}개`;
};

const formatReservationDate = (jsonb: Record<string, unknown> | null) =>
  typeof jsonb?.reservationDate === "string"
    ? jsonb.reservationDate
    : "날짜 미정";

const formatMemoTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));

const getAfterServiceStatusName = (status: string) =>
  Object.values(AfterServiceStatusEnum).find((item) => item.value === status)
    ?.name ?? status;

export default function PendingStatusButton() {
  const { isAdmin } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [afterServices, setAfterServices] = useState<AfterServiceRow[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [memos, setMemos] = useState<HandoverMemo[]>([]);
  const [memoInput, setMemoInput] = useState("");
  const [isMemoFormOpen, setIsMemoFormOpen] = useState(false);
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [memoStorageAvailable, setMemoStorageAvailable] = useState(true);
  const [memoToComplete, setMemoToComplete] = useState<HandoverMemo | null>(
    null,
  );
  const [isMemoHistoryOpen, setIsMemoHistoryOpen] = useState(false);
  const [memoHistory, setMemoHistory] = useState<HandoverMemo[]>([]);
  const [memoHistoryCount, setMemoHistoryCount] = useState(0);
  const [isMemoHistoryLoading, setIsMemoHistoryLoading] = useState(false);
  const [actorName, setActorName] = useState(isAdmin ? "관리자" : "");

  const resolveActorName = useCallback(async () => {
    if (isAdmin) {
      setActorName("관리자");
      return "관리자";
    }
    const storedWorkerName = getCurrentWorkerName();
    if (storedWorkerName) {
      setActorName(storedWorkerName);
      return storedWorkerName;
    }
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const { data } = await supabase
      .from("work_journals")
      .select("worker_name")
      .eq("work_date", today)
      .eq("status", "working")
      .limit(2);
    const resolvedName = data?.length === 1 ? data[0].worker_name : "";
    setActorName(resolvedName);
    return resolvedName;
  }, [isAdmin]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const inProgressStatuses = getAfterServiceStatusGroups().inProgress;
    const [reservationResult, afterServiceResult, purchaseOrderResult, memoResult] =
      await Promise.all([
        supabase
          .from("logs")
          .select("id, note, jsonb, customers(name, phone)")
          .eq("category", "reservation")
          .order("created_at", { ascending: false }),
        supabase
          .from("after_services")
          .select(
            "id, item_name, status, customer_note, shop_note, customers(name, phone)",
          )
          .in("status", inProgressStatuses)
          .order("created_at", { ascending: false }),
        supabase
          .from("inventory_purchase_orders")
          .select(
            "id, status, inventory_suppliers(name), inventory_purchase_order_lines(pending_quantity)",
          )
          .in("status", ["pending", "partial"])
          .order("created_at", { ascending: false }),
        supabase
          .from("handover_memos")
          .select(
            "id, content, author_name, created_at, is_completed, completed_at, completed_by_name",
          )
          .eq("is_completed", false)
          .order("created_at", { ascending: false }),
      ]);

    if (reservationResult.error) console.error(reservationResult.error);
    if (afterServiceResult.error) console.error(afterServiceResult.error);
    if (purchaseOrderResult.error) console.error(purchaseOrderResult.error);

    setReservations(
      ((reservationResult.data ?? []) as unknown as Array<
        Omit<ReservationRow, "customers"> & {
          customers: ReservationRow["customers"] | ReservationRow["customers"][];
        }
      >).map((row) => ({ ...row, customers: getRelation(row.customers) })),
    );
    setAfterServices(
      ((afterServiceResult.data ?? []) as unknown as Array<
        Omit<AfterServiceRow, "customers"> & {
          customers: AfterServiceRow["customers"] | AfterServiceRow["customers"][];
        }
      >).map((row) => ({ ...row, customers: getRelation(row.customers) })),
    );
    setPurchaseOrders(
      ((purchaseOrderResult.data ?? []) as unknown as Array<
        Omit<PurchaseOrderRow, "inventory_suppliers"> & {
          inventory_suppliers:
            | PurchaseOrderRow["inventory_suppliers"]
            | PurchaseOrderRow["inventory_suppliers"][];
        }
      >).map((row) => ({
        ...row,
        inventory_suppliers: getRelation(row.inventory_suppliers),
      })),
    );

    if (memoResult.error) {
      console.warn("전달 메모 저장소를 불러오지 못했습니다.", memoResult.error);
      setMemoStorageAvailable(false);
      setMemos([]);
    } else {
      setMemoStorageAvailable(true);
      setMemos((memoResult.data ?? []) as HandoverMemo[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadData();
    void resolveActorName();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loadData, resolveActorName]);

  const pendingSuppliers = useMemo(
    () =>
      purchaseOrders
        .map((order) => ({
          id: order.id,
          name: order.inventory_suppliers?.name ?? "거래처 미지정",
          pendingQuantity: order.inventory_purchase_order_lines.reduce(
            (sum, line) => sum + Math.max(0, line.pending_quantity ?? 0),
            0,
          ),
        }))
        .filter((order) => order.pendingQuantity > 0),
    [purchaseOrders],
  );
  const loadMemoHistory = async (offset = 0) => {
    setIsMemoHistoryLoading(true);
    const { data, error, count } = await supabase
      .from("handover_memos")
      .select(
        "id, content, author_name, created_at, is_completed, completed_at, completed_by_name",
        { count: "exact" },
      )
      .eq("is_completed", true)
      .order("completed_at", { ascending: false })
      .range(offset, offset + 19);
    setIsMemoHistoryLoading(false);
    if (error) {
      toast.error("이전 메모 기록을 불러오지 못했습니다.");
      return;
    }
    setMemoHistory((current) =>
      offset === 0
        ? ((data ?? []) as HandoverMemo[])
        : [...current, ...((data ?? []) as HandoverMemo[])],
    );
    setMemoHistoryCount(count ?? 0);
  };

  const addMemo = async () => {
    const content = memoInput.trim();
    if (!content || !memoStorageAvailable) return;
    const resolvedActorName = await resolveActorName();
    if (!resolvedActorName) {
      toast.error("현재 근무자를 확인할 수 없습니다. 출근 기록을 확인해 주세요.");
      return;
    }
    setIsSavingMemo(true);
    const { error } = await supabase.from("handover_memos").insert({
      content,
      author_name: resolvedActorName,
    });
    setIsSavingMemo(false);
    if (error) {
      toast.error("전달 메모를 저장하지 못했습니다.");
      return;
    }
    setMemoInput("");
    setIsMemoFormOpen(false);
    toast.success("전달 메모를 추가했습니다.");
    void loadData();
  };

  const completeMemo = async () => {
    if (!memoToComplete) return;
    const resolvedActorName = await resolveActorName();
    if (!resolvedActorName) {
      toast.error("현재 근무자를 확인할 수 없습니다. 출근 기록을 확인해 주세요.");
      return;
    }
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("handover_memos")
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        completed_by: authUser?.id ?? null,
        completed_by_name: resolvedActorName,
      })
      .eq("id", memoToComplete.id);
    if (error) {
      toast.error("전달 메모를 완료 처리하지 못했습니다.");
      return;
    }
    setMemoToComplete(null);
    toast.success("전달 메모를 완료 처리했습니다.");
    void loadData();
  };

  const deleteCompletedMemo = async (memo: HandoverMemo) => {
    if (!isAdmin) return;
    const shouldDelete = window.confirm(
      `이전 메모 기록을 삭제하시겠습니까?\n\n내용: ${memo.content}\n작성자: ${memo.author_name}\n처리자: ${memo.completed_by_name || "알 수 없음"}`,
    );
    if (!shouldDelete) return;
    const { error } = await supabase
      .from("handover_memos")
      .delete()
      .eq("id", memo.id)
      .eq("is_completed", true);
    if (error) {
      toast.error("이전 메모 기록을 삭제하지 못했습니다.");
      return;
    }
    setMemoHistory((current) =>
      current.filter((item) => item.id !== memo.id),
    );
    setMemoHistoryCount((current) => Math.max(0, current - 1));
    toast.success("이전 메모 기록을 삭제했습니다.");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="hidden h-10 cursor-pointer items-center gap-2 rounded-lg border border-brand-100 bg-white/90 px-3 text-sm font-semibold text-brand-700 shadow-sm transition-all hover:border-brand-200 hover:bg-white hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 lg:flex"
      >
        <span className="h-2 w-2 rounded-full bg-brand-500" />
        미처리 현황
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="미처리 현황 닫기"
            className="absolute inset-0 cursor-pointer bg-gray-950/50 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-status-title"
            className="relative z-10 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-6">
              <div>
                <h2 id="pending-status-title" className="text-xl font-bold text-gray-950">
                  미처리 현황
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  예약, A/S, 미입고와 전달 메모를 한곳에서 확인합니다.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={isLoading}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? "불러오는 중" : "새로고침"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="닫기"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  ×
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/70 p-4 sm:p-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <StatusCard
                  title="출고 예약"
                  count={reservations.length}
                  href="/histories?tab=reservation"
                >
                  {reservations.slice(0, 5).map((reservation) => (
                    <Link
                      key={reservation.id}
                      href="/histories?tab=reservation"
                      onClick={() => setIsOpen(false)}
                      className="grid grid-cols-[1fr_auto] gap-3 border-b border-gray-100 px-1 py-3 last:border-b-0 hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-gray-900">
                          {reservation.customers?.name ?? "고객 정보 없음"}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-gray-500">
                          {formatReservationItems(reservation.jsonb)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-brand-600">
                        {formatReservationDate(reservation.jsonb)}
                      </span>
                    </Link>
                  ))}
                  {!isLoading && reservations.length === 0 && (
                    <EmptyState text="미처리 출고 예약이 없습니다." />
                  )}
                </StatusCard>

                <StatusCard
                  title="진행 중 A/S"
                  count={afterServices.length}
                  href="/after-services?group=inProgress"
                >
                  {afterServices.slice(0, 5).map((afterService) => (
                    <Link
                      key={afterService.id}
                      href={`/after-services?group=inProgress&id=${afterService.id}`}
                      onClick={() => setIsOpen(false)}
                      className="grid gap-3 border-b border-gray-100 px-1 py-3 last:border-b-0 hover:bg-gray-50 sm:grid-cols-[minmax(100px,0.8fr)_minmax(100px,1fr)_minmax(110px,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-gray-900">
                          {afterService.customers?.name ?? "고객 정보 없음"}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-gray-500">
                          {afterService.item_name}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-400">
                          고객 특이사항
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">
                          {afterService.customer_note || "없음"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-400">
                          매장 특이사항
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">
                          {afterService.shop_note || "없음"}
                        </p>
                      </div>
                      <span className="rounded-md bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-700">
                        {getAfterServiceStatusName(afterService.status)}
                      </span>
                    </Link>
                  ))}
                  {!isLoading && afterServices.length === 0 && (
                    <EmptyState text="진행 중인 A/S가 없습니다." />
                  )}
                </StatusCard>

                <StatusCard title="미입고 거래처" count={pendingSuppliers.length} href="/inventory/receive">
                  {pendingSuppliers.slice(0, 5).map((supplier) => (
                    <Link
                      key={supplier.id}
                      href="/inventory/receive"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center justify-between gap-3 border-b border-gray-100 px-1 py-3 last:border-b-0 hover:bg-gray-50"
                    >
                      <span className="truncate text-base font-semibold text-gray-900">
                        {supplier.name}
                      </span>
                      <span className="text-sm font-semibold text-brand-600">
                        {supplier.pendingQuantity.toLocaleString()}개 미입고
                      </span>
                    </Link>
                  ))}
                  {!isLoading && pendingSuppliers.length === 0 && (
                    <EmptyState text="미입고 거래처가 없습니다." />
                  )}
                </StatusCard>

                <StatusCard
                  title="전달 메모"
                  count={memos.length}
                  action={
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsMemoHistoryOpen(true);
                          void loadMemoHistory(0);
                        }}
                        className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:border-brand-200 hover:bg-gray-50 hover:text-brand-600"
                      >
                        이전 메모 기록
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMemoFormOpen(true)}
                        disabled={!memoStorageAvailable || isMemoFormOpen}
                        className="cursor-pointer rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        메모 추가
                      </button>
                    </div>
                  }
                >
                  {memos.slice(0, 5).map((memo) => (
                    <div
                      key={memo.id}
                      className="flex items-start gap-3 border-b border-gray-100 px-1 py-3 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-base text-gray-800">{memo.content}</p>
                        <p className="mt-1 text-sm text-gray-400">
                          {memo.author_name} · {formatMemoTime(memo.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void resolveActorName().then((resolvedName) => {
                            if (!resolvedName) {
                              toast.error(
                                "현재 근무자를 확인할 수 없습니다. 출근 기록을 확인해 주세요.",
                              );
                              return;
                            }
                            setMemoToComplete(memo);
                          });
                        }}
                        className="cursor-pointer rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-50"
                      >
                        완료
                      </button>
                    </div>
                  ))}
                  {!isLoading && memos.length === 0 && (
                    <EmptyState
                      text={
                        memoStorageAvailable
                          ? "등록된 전달 메모가 없습니다."
                          : "전달 메모 DB 적용이 필요합니다."
                      }
                    />
                  )}
                  {isMemoFormOpen && (
                    <div className="border-t border-gray-100 pt-3">
                      <input
                        type="text"
                        value={memoInput}
                        onChange={(event) => setMemoInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && memoInput.trim()) {
                            void addMemo();
                          }
                        }}
                        autoFocus
                        disabled={!memoStorageAvailable || isSavingMemo}
                        placeholder="전달할 내용을 입력하세요"
                        className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 shadow-sm outline-none placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setMemoInput("");
                            setIsMemoFormOpen(false);
                          }}
                          disabled={isSavingMemo}
                          className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void addMemo()}
                          disabled={
                            !memoInput.trim() ||
                            isSavingMemo ||
                            !memoStorageAvailable
                          }
                          className="cursor-pointer rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isSavingMemo ? "등록 중" : "등록"}
                        </button>
                      </div>
                    </div>
                  )}
                </StatusCard>
              </div>
            </div>
          </section>
        </div>
      )}

      {memoToComplete && (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-950/40" />
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="complete-memo-title"
            className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h3 id="complete-memo-title" className="text-lg font-bold text-gray-900">
              전달 메모 완료 처리
            </h3>
            <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div>
                <p className="text-xs font-semibold text-gray-500">내용</p>
                <p className="mt-1 break-words text-sm text-gray-900">
                  {memoToComplete.content}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500">작성자</p>
                  <p className="mt-1 text-sm font-semibold text-gray-800">
                    {memoToComplete.author_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">처리자</p>
                  <p className="mt-1 text-sm font-semibold text-gray-800">
                    {actorName}
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium text-gray-700">
              완료 처리하시겠습니까?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMemoToComplete(null)}
                className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={() => void completeMemo()}
                className="cursor-pointer rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
              >
                네
              </button>
            </div>
          </section>
        </div>
      )}

      {isMemoHistoryOpen && (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="이전 메모 기록 닫기"
            onClick={() => setIsMemoHistoryOpen(false)}
            className="absolute inset-0 cursor-pointer bg-gray-950/45"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="memo-history-title"
            className="relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 id="memo-history-title" className="text-lg font-bold text-gray-900">
                  이전 메모 기록
                </h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  완료 처리된 전달 메모 {memoHistoryCount.toLocaleString()}건
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMemoHistoryOpen(false)}
                aria-label="닫기"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ×
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {memoHistory.map((memo) => (
                <article
                  key={memo.id}
                  className="border-b border-gray-200 py-4 first:pt-0 last:border-b-0"
                >
                  <p className="break-words text-base text-gray-800">
                    {memo.content}
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span>작성자 {memo.author_name}</span>
                      <span>처리자 {memo.completed_by_name || "알 수 없음"}</span>
                      {memo.completed_at && (
                        <span>완료 {formatMemoTime(memo.completed_at)}</span>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => void deleteCompletedMemo(memo)}
                        className="shrink-0 cursor-pointer rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!isMemoHistoryLoading && memoHistory.length === 0 && (
                <EmptyState text="완료된 전달 메모가 없습니다." />
              )}
              {memoHistory.length < memoHistoryCount && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadMemoHistory(memoHistory.length)}
                    disabled={isMemoHistoryLoading}
                    className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isMemoHistoryLoading ? "불러오는 중" : "더 보기"}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

const StatusCard = ({
  title,
  count,
  href,
  action,
  children,
}: {
  title: string;
  count: number;
  href?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-sm font-semibold text-brand-600">
          {count}
        </span>
      </div>
      {action ?? (href && (
        <Link href={href} className="text-sm font-semibold text-gray-500 hover:text-brand-600">
          전체 보기
        </Link>
      ))}
    </div>
    <div>{children}</div>
  </article>
);

const EmptyState = ({ text }: { text: string }) => (
  <p className="py-9 text-center text-base text-gray-400">{text}</p>
);
