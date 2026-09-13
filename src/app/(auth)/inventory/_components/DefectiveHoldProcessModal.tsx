"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import { Dropdown, DropdownOption } from "@/app/_components/Dropdown";
import { getInventorySuppliers, inventoryKeys, type DefectiveInventoryHold } from "@/app/_domains/_inventory/_services/inventoryService";
import { processDefectiveInventoryHold } from "@/app/_domains/_refund/refundService";

type Action = "after_service" | "supplier_return" | "scrap";

const actionOptions: Array<{ value: Action; label: string }> = [
  { value: "after_service", label: "불량 반품 A/S 접수" },
  { value: "supplier_return", label: "도매처 반품" },
  { value: "scrap", label: "자체 폐기" },
];

export default function DefectiveHoldProcessModal({ hold, onClose, onComplete }: { hold: DefectiveInventoryHold; onClose: () => void; onComplete: () => Promise<void> | void }) {
  const [action, setAction] = useState<Action>("after_service");
  const [supplierId, setSupplierId] = useState("");
  const [settlementType, setSettlementType] = useState<"supplier_credit" | "bank_refund">("supplier_credit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suppliersQuery = useQuery({ queryKey: [...inventoryKeys.suppliers, "defective-return"], queryFn: () => getInventorySuppliers(false) });
  const supplierOptions = useMemo(() => (suppliersQuery.data ?? []).filter((supplier) => supplier.is_use).map((supplier) => ({ value: supplier.id, label: supplier.name })), [suppliersQuery.data]);
  const needsSettlement = action === "supplier_return";
  const numericAmount = Math.max(0, Number(amount.replaceAll(",", "")) || 0);
  const canSubmit = action === "after_service" || action === "scrap" || (Boolean(supplierId) && numericAmount > 0);

  const submit = async () => {
    if (!canSubmit) return;
    try {
      setIsSubmitting(true);
      await processDefectiveInventoryHold({ holdId: hold.id, action, supplierId: supplierId || undefined, settlementType: needsSettlement ? settlementType : undefined, settlementAmount: needsSettlement ? numericAmount : undefined, note });
      await onComplete();
      toast.success(action === "after_service" ? "불량 반품 A/S를 접수했습니다." : action === "supplier_return" ? "도매처 반품 정산을 기록했습니다." : "자체 폐기를 처리했습니다.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "불량 보관품 처리에 실패했습니다.");
    } finally { setIsSubmitting(false); }
  };

  return <div className="flex max-h-[calc(90vh-2rem)] min-h-0 w-full flex-col">
    <div className="shrink-0 border-b border-gray-200 pb-4"><h2 className="text-lg font-semibold text-gray-900">불량 보관품 처리</h2><p className="mt-1 text-sm text-gray-500">{hold.itemName} {hold.quantity}개 · 판매 가능 재고에는 포함되지 않습니다.</p></div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 pr-1">
      <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700">처리 방식</span><Dropdown controlledValue={action}><Dropdown.Trigger>{actionOptions.find((option) => option.value === action)?.label}</Dropdown.Trigger><Dropdown.Content>{actionOptions.map((option) => <Dropdown.Item key={option.value} option={option} onSelect={(selected: DropdownOption) => setAction(selected.value as Action)} />)}</Dropdown.Content></Dropdown></label>
      {needsSettlement && <><label className="block"><span className="mb-1 block text-sm font-medium text-gray-700">도매처</span><Dropdown controlledValue={supplierId}><Dropdown.Trigger>{supplierOptions.find((option) => option.value === supplierId)?.label ?? "도매처를 선택하세요"}</Dropdown.Trigger><Dropdown.Content>{supplierOptions.map((option) => <Dropdown.Item key={option.value} option={option} onSelect={(selected: DropdownOption) => setSupplierId(String(selected.value))} />)}</Dropdown.Content></Dropdown></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1 block text-sm font-medium text-gray-700">정산 방식</span><Dropdown controlledValue={settlementType}><Dropdown.Trigger>{settlementType === "supplier_credit" ? "적립금" : "계좌 환불"}</Dropdown.Trigger><Dropdown.Content><Dropdown.Item option={{ value: "supplier_credit", label: "적립금" }} onSelect={() => setSettlementType("supplier_credit")} /><Dropdown.Item option={{ value: "bank_refund", label: "계좌 환불" }} onSelect={() => setSettlementType("bank_refund")} /></Dropdown.Content></Dropdown></label><label><span className="mb-1 block text-sm font-medium text-gray-700">정산 금액</span><input value={amount} inputMode="numeric" onChange={(event) => setAmount(event.target.value.replace(/[^0-9,]/g, ""))} placeholder="0" className="w-full rounded-lg border border-gray-300 bg-white py-2.5 px-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></label></div></>}
      <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700">처리 메모</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="처리 사유 또는 참고 내용을 입력하세요" className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></label>
      {action === "after_service" && <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-800">고객·환불·품목 정보가 연결된 불량 반품 A/S를 생성합니다.</p>}
    </div>
    <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 pt-4"><Button variant="gray" size="sm" onClick={onClose}>취소</Button><Button size="sm" disabled={!canSubmit || isSubmitting} onClick={submit}>처리 저장</Button></div>
  </div>;
}
