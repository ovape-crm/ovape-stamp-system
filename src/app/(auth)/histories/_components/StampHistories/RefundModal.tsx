"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/app/_components/Button";
import { Dropdown, DropdownOption } from "@/app/_components/Dropdown";
import { PaymentTypeEnum } from "@/app/_enums/enums";
import { LogBaseType, LogCustomerInfo } from "@/app/_domains/_log/_types/log.types";
import { createCustomerRefund, getCustomerRefundSummary, RefundSummary } from "@/app/_domains/_refund/refundService";
import toast from "react-hot-toast";

const recoveryOptions = [
  { label: "물건 회수 없음", value: "none" },
  { label: "정상 제품 (새제품)", value: "normal" },
  { label: "불량 제품", value: "defective" },
];

const paymentNameByValue = Object.values(PaymentTypeEnum).reduce<Record<string, string>>(
  (names, payment) => ({ ...names, [payment.value]: payment.name }),
  {},
);

interface RefundModalProps {
  log: LogBaseType & { customers?: LogCustomerInfo };
  onCancel: () => void;
}

const RefundModal = ({ log, onCancel }: RefundModalProps) => {
  const outboundItems = Array.isArray(log.jsonb?.items)
    ? log.jsonb.items
        .map((item, index) => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          const quantity = Number(record.quantity ?? 0);
          const itemName = typeof record.itemName === "string" ? record.itemName : "상품명 없음";
          return quantity > 0
            ? {
                sourceLineIndex: index,
                key: `${String(record.itemId ?? itemName)}-${index}`,
                itemId: record.itemId,
                name: itemName,
                quantity,
                unitPrice: Math.max(0, Number(record.adjustedUnitPrice ?? record.unitPrice ?? 0)),
                amount: Math.max(0, Number(record.amount ?? 0)),
              }
            : null;
        })
        .filter((item): item is { sourceLineIndex: number; key: string; itemId: unknown; name: string; quantity: number; unitPrice: number; amount: number } => item !== null)
    : [];
  const totalAmount = Math.max(0, Number(log.jsonb?.totalAmount ?? 0));
  const [refundSummary, setRefundSummary] = useState<RefundSummary>({ refundedAmount: 0, refundedQuantities: {} });
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [refundAmount, setRefundAmount] = useState("");
  const [recoveryType, setRecoveryType] = useState(recoveryOptions[0].value);
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>(
    () => Object.fromEntries(outboundItems.map((item) => [item.key, item.quantity])),
  );
  useEffect(() => {
    let active = true;
    getCustomerRefundSummary(String(log.id))
      .then((summary) => {
        if (!active) return;
        setRefundSummary(summary);
        setSelectedQuantities(Object.fromEntries(outboundItems.map((item) => [item.key, Math.max(0, item.quantity - (summary.refundedQuantities[item.sourceLineIndex] ?? 0))])));
        setRefundAmount(String(Math.max(0, totalAmount - summary.refundedAmount)));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "기존 환불 이력을 불러오지 못했습니다."))
      .finally(() => active && setIsSummaryLoading(false));
    return () => { active = false; };
  }, [log.id, totalAmount]);
  const parsedRefundAmount = Math.max(0, Number(refundAmount.replaceAll(",", "")) || 0);
  const refundAvailableAmount = Math.max(0, totalAmount - refundSummary.refundedAmount);
  const originalPayments = Array.isArray(log.jsonb?.payments)
    ? log.jsonb.payments.filter(
        (payment): payment is { paymentType: string; amount: number } =>
          typeof payment === "object" &&
          payment !== null &&
          typeof payment.paymentType === "string" &&
          typeof payment.amount === "number",
      )
    : [];
  const originalPaymentLabel = originalPayments.length > 0
    ? originalPayments
        .map((payment) => `${paymentNameByValue[payment.paymentType] ?? payment.paymentType} ${payment.amount.toLocaleString("ko-KR")}원`)
        .join(" · ")
    : paymentNameByValue[String(log.jsonb?.paymentType ?? "")] ?? "결제 방식 정보 없음";

  const refundPayments = useMemo(() => {
    const payments = originalPayments.length > 0
      ? originalPayments
      : [{ paymentType: String(log.jsonb?.paymentType ?? "cash"), amount: totalAmount }];
    const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    let remaining = parsedRefundAmount;
    return payments.map((payment, index) => {
      const amount = index === payments.length - 1
        ? remaining
        : Math.min(remaining, Math.round(parsedRefundAmount * payment.amount / Math.max(1, paymentTotal)));
      remaining -= amount;
      return { paymentType: payment.paymentType, amount };
    }).filter((payment) => payment.amount > 0);
  }, [log.jsonb, originalPayments, parsedRefundAmount, totalAmount]);

  const selectedItems = outboundItems.filter((item) => (selectedQuantities[item.key] ?? 0) > 0);
  const selectedLimitAmount = useMemo(() => {
    const sourceItemsAmount = outboundItems.reduce((sum, item) => sum + (item.amount || item.unitPrice * item.quantity), 0);
    if (sourceItemsAmount <= 0) return 0;
    return selectedItems.reduce(
      (sum, item) => sum + Math.round((item.amount || item.unitPrice * item.quantity) * (selectedQuantities[item.key] / item.quantity) * totalAmount / sourceItemsAmount),
      0,
    );
  }, [outboundItems, selectedItems, selectedQuantities, totalAmount]);
  const requiresAdjustmentReason = parsedRefundAmount !== selectedLimitAmount;
  const recoveryLabel = recoveryOptions.find((option) => option.value === recoveryType)?.label ?? "-";
  const handleCreate = async () => {
    try {
      setIsSubmitting(true);
      await createCustomerRefund({ sourceLogId: String(log.id), recoveryType: recoveryType as "none" | "normal" | "defective", refundAmount: parsedRefundAmount, selectedLimitAmount, adjustmentReason, reason, memo,
        lines: selectedItems.map((item) => ({ sourceLineIndex: item.sourceLineIndex, itemId: typeof item.itemId === "string" || typeof item.itemId === "number" ? item.itemId : undefined, itemName: item.name, quantity: selectedQuantities[item.key], grossUnitPrice: item.unitPrice, allocatedDiscountAmount: 0, refundableAmount: Math.round((item.amount || item.unitPrice * item.quantity) * (selectedQuantities[item.key] / item.quantity) * totalAmount / Math.max(1, outboundItems.reduce((sum, sourceItem) => sum + (sourceItem.amount || sourceItem.unitPrice * sourceItem.quantity), 0))) })),
        payments: refundPayments,
      });
      toast.success("환불 이력이 생성되었습니다."); onCancel();
    } catch (error) {
      const message =
        error && typeof error === "object"
          ? "message" in error && error.message
            ? String(error.message)
            : JSON.stringify(error)
          : typeof error === "string"
            ? error
            : "환불 저장에 실패했습니다.";
      toast.error(message);
    }
    finally { setIsSubmitting(false); }
  };

  if (isReviewOpen) {
    return (
      <div className="flex max-h-[calc(90vh-2rem)] min-h-0 w-full flex-col">
        <div className="shrink-0 border-b border-gray-200 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">환불 검수</h2>
          <p className="mt-1 text-sm text-gray-500">아래 내용을 확인한 뒤 환불 이력을 생성합니다.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 pr-1">
          <section className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm"><tbody>
              <tr className="border-b border-gray-100"><th className="w-28 bg-gray-50 px-3 py-3 text-left font-medium text-gray-600">원결제</th><td className="px-3 py-3 text-gray-800">{originalPaymentLabel}</td></tr>
              <tr className="border-b border-gray-100"><th className="bg-gray-50 px-3 py-3 text-left font-medium text-gray-600">환불 품목</th><td className="px-3 py-3 text-gray-800">{selectedItems.map((item) => `${item.name} ${selectedQuantities[item.key]}개`).join(" · ") || "선택 없음"}</td></tr>
              <tr className="border-b border-gray-100"><th className="bg-gray-50 px-3 py-3 text-left font-medium text-gray-600">환불 금액</th><td className="px-3 py-3 font-semibold text-brand-600">{parsedRefundAmount.toLocaleString("ko-KR")}원</td></tr>
              <tr className="border-b border-gray-100"><th className="bg-gray-50 px-3 py-3 text-left font-medium text-gray-600">물건 회수</th><td className="px-3 py-3 text-gray-800">{recoveryLabel}</td></tr>
              <tr><th className="bg-gray-50 px-3 py-3 text-left font-medium text-gray-600">사유·메모</th><td className="whitespace-pre-wrap px-3 py-3 text-gray-800">{reason || "-"}{memo ? `\n${memo}` : ""}</td></tr>
            </tbody></table>
          </section>
          {log.action.startsWith("add-") && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">이 출고에는 스탬프 적립 이력이 있습니다. 환불 후 필요하면 고객 상세에서 스탬프를 조정해 주세요.</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-white pt-4">
          <Button variant="gray" size="sm" onClick={() => setIsReviewOpen(false)}>이전</Button>
          <Button size="sm" disabled={isSubmitting} onClick={handleCreate}>환불 이력 생성</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-[calc(90vh-2rem)] min-h-0 w-full flex-col">
      <div className="shrink-0 border-b border-gray-200 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">환불 처리</h2>
        <p className="mt-1 text-sm text-gray-500">
          원출고 이력은 유지하고, 환불 이력을 별도로 생성합니다.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-5 pr-1">
        <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
          <h3 className="text-sm font-semibold text-gray-800">원출고 이력</h3>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500">고객</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {log.customers?.name ?? "-"} {log.customers?.phone ? `(${log.customers.phone})` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">출고 금액</dt>
              <dd className="mt-0.5 font-semibold text-gray-900">
                {totalAmount.toLocaleString("ko-KR")}원
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-gray-500">출고 내용</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-gray-700">{log.note || "-"}</dd>
            </div>
          </dl>
        </section>

        <section className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-gray-700">환불 대상 물건</label>
              <span className="text-xs text-gray-500">부분 수량 선택 가능</span>
            </div>
            {outboundItems.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                {outboundItems.map((item) => {
                  const selectedQuantity = selectedQuantities[item.key] ?? 0;
                  const isSelected = selectedQuantity > 0;
                  return (
                    <div key={item.key} className="flex items-center gap-3 border-b border-gray-100 p-3 last:border-b-0">
                      <input
                        id={`refund-item-${item.key}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) =>
                          setSelectedQuantities((current) => ({
                            ...current,
                            [item.key]: event.target.checked ? item.quantity : 0,
                          }))
                        }
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <label htmlFor={`refund-item-${item.key}`} className="min-w-0 flex-1 cursor-pointer text-sm font-medium text-gray-800">
                        {item.name}
                        <span className="ml-2 text-xs font-normal text-gray-500">출고 {item.quantity}개 · 환불 가능 {Math.max(0, item.quantity - (refundSummary.refundedQuantities[item.sourceLineIndex] ?? 0))}개</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          aria-label={`${item.name} 환불 수량`}
                          type="number"
                          min="0"
                          max={Math.max(0, item.quantity - (refundSummary.refundedQuantities[item.sourceLineIndex] ?? 0))}
                          value={selectedQuantity}
                          disabled={!isSelected}
                          onChange={(event) => {
                            const nextQuantity = Math.min(Math.max(0, item.quantity - (refundSummary.refundedQuantities[item.sourceLineIndex] ?? 0)), Math.max(0, Number(event.target.value) || 0));
                            setSelectedQuantities((current) => ({ ...current, [item.key]: nextQuantity }));
                          }}
                          className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right text-sm font-medium text-gray-900 outline-none transition hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                        />
                        <span className="text-sm text-gray-500">개</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500">
                이 출고 이력에는 선택할 품목 정보가 없습니다. 환불 금액만 처리할 수 있습니다.
              </p>
            )}
          </div>

          {requiresAdjustmentReason && (
            <div>
              <label htmlFor="refund-adjustment-reason" className="mb-1 block text-sm font-medium text-gray-700">금액 조정 사유</label>
              <input id="refund-adjustment-reason" value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="선택 품목 금액과 다른 사유를 입력하세요" className="w-full rounded-lg border border-gray-300 bg-white py-2.5 px-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">누적 환불액</label>
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">{refundSummary.refundedAmount.toLocaleString("ko-KR")}원</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">환불 가능 금액</label>
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-brand-600">
                {refundAvailableAmount.toLocaleString("ko-KR")}원
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="refund-amount" className="mb-1 block text-sm font-medium text-gray-700">환불 금액</label>
            <div className="relative">
              <input
                id="refund-amount"
                inputMode="numeric"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value.replace(/[^0-9,]/g, ""))}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                aria-describedby="refund-amount-help"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-500">원</span>
            </div>
            {parsedRefundAmount > Math.min(refundAvailableAmount, selectedLimitAmount) && (
              <p id="refund-amount-help" className="mt-1 text-xs text-rose-600">선택 품목 또는 누적 환불 한도를 초과했습니다.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">환불 결제방식</span>
              <p className="min-h-11 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-700">
                {originalPaymentLabel}
              </p>
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">물건 회수</span>
              <Dropdown controlledValue={recoveryType}>
                <Dropdown.Trigger>{recoveryOptions.find((option) => option.value === recoveryType)?.label}</Dropdown.Trigger>
                <Dropdown.Content>
                  {recoveryOptions.map((option) => (
                    <Dropdown.Item key={option.value} option={option} onSelect={(selected: DropdownOption) => setRecoveryType(String(selected.value))} />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            </div>
          </div>

          <div>
            <label htmlFor="refund-reason" className="mb-1 block text-sm font-medium text-gray-700">환불 사유</label>
            <input id="refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="환불 사유를 입력하세요" className="w-full rounded-lg border border-gray-300 bg-white py-2.5 px-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </div>

          <div>
            <label htmlFor="refund-memo" className="mb-1 block text-sm font-medium text-gray-700">메모</label>
            <textarea id="refund-memo" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="내부 메모를 입력하세요 (선택)" rows={3} className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </div>
        </section>
      </div>

      <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-white pt-4">
        <Button variant="gray" size="sm" onClick={onCancel}>취소</Button>
        <Button size="sm" disabled={isSummaryLoading || selectedItems.length === 0 || !reason.trim() || (requiresAdjustmentReason && !adjustmentReason.trim()) || parsedRefundAmount <= 0 || parsedRefundAmount > Math.min(refundAvailableAmount, selectedLimitAmount)} onClick={() => setIsReviewOpen(true)}>환불 검수</Button>
      </div>
    </div>
  );
};

export default RefundModal;
