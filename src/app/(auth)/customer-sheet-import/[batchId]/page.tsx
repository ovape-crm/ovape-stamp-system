"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import {
  getCustomerSheetImportCandidates,
  getCustomerSheetImportRows,
  updateCustomerSheetImportRow,
  appendCustomerSheetImportRows,
  deleteCustomerSheetImportRow,
  applyCustomerSheetImportBatch,
  type CustomerSheetImportCandidate,
  type CustomerSheetImportRow,
  type CustomerSheetImportStatus,
} from "@/app/_domains/_customer/_services/customerSheetImportService";
import { parseCustomerSheetPaste } from "@/app/_domains/_customer/_utils/customerSheetPaste";

const normalizePhone = (value: string) => value.replace(/\D/g, "");
const isKnown = (value: string) => Boolean(value.trim()) && value.trim().toUpperCase() !== "X";
const normalizeDuplicateValue = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
const buildSourceFingerprint = (row: CustomerSheetImportRow) => [
  row.storeName,
  row.soldAtText,
  row.itemName,
  row.paidAmountText,
  row.paymentMethod,
  row.customerName,
  normalizePhone(row.customerPhone),
  row.customerNote,
  row.customerAddress,
].map(normalizeDuplicateValue).join("\u0000");
const statusLabel: Record<CustomerSheetImportStatus, string> = {
  pending: "검토 전",
  matched: "기존 고객 연결 후보",
  new_customer: "신규 고객 후보",
  hold: "보류",
  x_transfer: "X 통합 계정 이전 후보",
  duplicate: "중복 의심",
  applied: "반영 완료",
};

export default function CustomerSheetImportReviewPage({ params }: { params: Promise<{ batchId: string }> }) {
  const [batchId, setBatchId] = useState("");
  const [rows, setRows] = useState<CustomerSheetImportRow[]>([]);
  const [customers, setCustomers] = useState<CustomerSheetImportCandidate[]>([]);
  const [filter, setFilter] = useState<CustomerSheetImportStatus | "all">("pending");
  const [isLoading, setIsLoading] = useState(true);
  const [appendValue, setAppendValue] = useState("");
  const [isAppending, setIsAppending] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    params.then(({ batchId: value }) => setBatchId(value));
  }, [params]);

  useEffect(() => {
    if (!batchId) return;
    Promise.all([getCustomerSheetImportRows(batchId), getCustomerSheetImportCandidates()])
      .then(([importRows, currentCustomers]) => {
        setRows(importRows);
        setCustomers(currentCustomers);
      })
      .catch((error) => {
        console.error(error);
        toast.error("임시 작업대를 불러오지 못했습니다.");
      })
      .finally(() => setIsLoading(false));
  }, [batchId]);

  const candidateByPhone = useMemo(() => {
    const map = new Map<string, CustomerSheetImportCandidate[]>();
    customers.forEach((customer) => {
      const phone = normalizePhone(customer.phone);
      if (!phone) return;
      map.set(phone, [...(map.get(phone) ?? []), customer]);
    });
    return map;
  }, [customers]);

  const candidateByName = useMemo(() => {
    const map = new Map<string, CustomerSheetImportCandidate[]>();
    customers.forEach((customer) => {
      const name = customer.name.trim();
      if (!isKnown(name)) return;
      map.set(name, [...(map.get(name) ?? []), customer]);
    });
    return map;
  }, [customers]);
  const unifiedXCustomer = useMemo(
    () => customers.find((customer) => customer.name.trim() === "X" && customer.phone.trim() === "X" && customer.gender === "special") ?? null,
    [customers],
  );

  const reviewedRows = useMemo(() => rows.map((row) => {
    const phone = normalizePhone(row.customerPhone);
    const exactPhoneCandidates = phone.length >= 10 ? candidateByPhone.get(phone) ?? [] : [];
    const nameCandidates = isKnown(row.customerName) ? candidateByName.get(row.customerName.trim()) ?? [] : [];
    const candidates = exactPhoneCandidates.length ? exactPhoneCandidates : nameCandidates;
    return { row, candidates, exactPhone: exactPhoneCandidates.length === 1 };
  }), [candidateByName, candidateByPhone, rows]);

  const sourceDuplicateRows = useMemo(() => {
    const grouped = new Map<string, CustomerSheetImportRow[]>();
    rows.forEach((row) => {
      const key = buildSourceFingerprint(row);
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    });
    return grouped;
  }, [rows]);
  const sourceDuplicateCount = useMemo(
    () => [...sourceDuplicateRows.values()].reduce((total, group) => total + (group.length > 1 ? group.length : 0), 0),
    [sourceDuplicateRows],
  );

  const visibleRows = reviewedRows.filter(({ row }) => filter === "all" || row.reviewStatus === filter).slice(0, 200);
  const counts = useMemo(() => rows.reduce<Record<CustomerSheetImportStatus, number>>((result, row) => ({ ...result, [row.reviewStatus]: result[row.reviewStatus] + 1 }), { pending: 0, matched: 0, new_customer: 0, hold: 0, x_transfer: 0, duplicate: 0, applied: 0 }), [rows]);

  const updateRow = async (row: CustomerSheetImportRow, status: CustomerSheetImportStatus, selectedCustomerId: number | null) => {
    try {
      await updateCustomerSheetImportRow(row.id, { reviewStatus: status, selectedCustomerId, reviewNote: row.reviewNote, proposedChanges: row.proposedChanges });
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, reviewStatus: status, selectedCustomerId } : item));
    } catch (error) {
      console.error(error);
      toast.error("검토 상태를 저장하지 못했습니다.");
    }
  };
  const appendRows = async () => {
    const newRows = parseCustomerSheetPaste(appendValue);
    if (!newRows.length) return toast.error("추가할 시트 행을 붙여넣어 주세요.");
    try {
      setIsAppending(true);
      await appendCustomerSheetImportRows(batchId, newRows);
      setRows(await getCustomerSheetImportRows(batchId));
      setAppendValue("");
      toast.success(`${newRows.length.toLocaleString("ko-KR")}건을 현재 작업대에 추가했습니다.`);
    } catch (error) {
      console.error(error);
      toast.error("추가 붙여넣기에 실패했습니다.");
    } finally { setIsAppending(false); }
  };
  const removeRow = async (row: CustomerSheetImportRow) => {
    if (!window.confirm(`시트 ${row.sourceRowNumber}행을 임시 작업대에서 삭제할까요? 실제 고객·출고 이력은 변경되지 않습니다.`)) return;
    try {
      await deleteCustomerSheetImportRow(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      toast.success("임시 행을 삭제했습니다.");
    } catch (error) {
      console.error(error);
      toast.error("임시 행 삭제에 실패했습니다.");
    }
  };
  const setNewCustomerGender = async (row: CustomerSheetImportRow, gender: "male" | "female") => {
    try {
      const proposedChanges = { ...row.proposedChanges, gender };
      await updateCustomerSheetImportRow(row.id, { reviewStatus: "new_customer", selectedCustomerId: null, reviewNote: row.reviewNote, proposedChanges });
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, reviewStatus: "new_customer", selectedCustomerId: null, proposedChanges } : item));
    } catch (error) {
      console.error(error);
      toast.error("신규 고객 정보를 저장하지 못했습니다.");
    }
  };
  const applyBatch = async () => {
    const selected = counts.matched + counts.new_customer + counts.x_transfer;
    if (!selected) return toast.error("기존 고객·신규 고객·X 통합 중 반영할 행을 먼저 선택해 주세요.");
    if (!window.confirm(`${selected.toLocaleString("ko-KR")}건을 실제 고객·출고 이력에 반영할까요? 중복 의심·보류·검토 전 행은 반영하지 않습니다. 재고와 스탬프는 변경되지 않습니다.`)) return;
    try {
      setIsApplying(true);
      const result = await applyCustomerSheetImportBatch(batchId);
      setRows(await getCustomerSheetImportRows(batchId));
      toast.success(`반영 ${result.appliedRows.toLocaleString("ko-KR")}건 · 중복 보류 ${result.duplicateRows.toLocaleString("ko-KR")}건 · 입력 보류 ${result.heldRows.toLocaleString("ko-KR")}건`);
    } catch (error) {
      console.error(error);
      toast.error("반영에 실패했습니다. 실제 데이터는 전체 작업이 취소되었습니다.");
    } finally { setIsApplying(false); }
  };

  if (isLoading) return <main className="mx-auto max-w-7xl px-4 py-8 text-sm text-gray-500">임시 작업대를 불러오는 중...</main>;

  return <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h1 className="text-xl font-bold text-gray-900">고객 비교 및 검토</h1>
      <p className="mt-2 text-sm text-gray-600">선택과 상태 변경은 임시 작업대에만 저장됩니다. 이 화면에서는 고객·판매 이력이 변경되지 않습니다.</p>
    </section>
    <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
      <div className="flex flex-wrap gap-2">
          {(["all", "pending", "matched", "new_customer", "hold", "x_transfer", "duplicate", "applied"] as const).map((value) => <Button key={value} size="xs" variant={filter === value ? "primary" : "secondary"} onClick={() => setFilter(value)}>{value === "all" ? `전체 ${rows.length.toLocaleString("ko-KR")}` : `${statusLabel[value]} ${counts[value].toLocaleString("ko-KR")}`}</Button>)}
      </div>
      <p className="mt-3 text-xs text-gray-600">시트 원문이 완전히 같은 중복 의심 행 <span className="font-semibold text-brand-600">{sourceDuplicateCount.toLocaleString("ko-KR")}</span>건 · 자동 삭제하지 않고 같은 묶음으로 표시합니다.</p>
    </section>
    <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
      <label className="block text-sm font-semibold text-gray-800">같은 작업대에 시트 행 추가 붙여넣기
        <textarea value={appendValue} onChange={(event) => setAppendValue(event.target.value)} rows={5} placeholder="구글시트에서 수정·필터한 행을 다시 복사해 붙여넣으세요. 기존 작업대에 이어서 저장됩니다." className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm outline-none transition placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </label>
      <div className="mt-2 flex justify-end"><Button size="sm" onClick={appendRows} disabled={isAppending || !appendValue.trim()}>{isAppending ? "추가 중..." : "현재 작업대에 추가"}</Button></div>
    </section>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-gray-600 sm:text-sm">현재 필터에서 처음 200건을 표시합니다. 고객 변경은 마지막 <span className="font-semibold text-brand-600">반영하기</span> 단계 전까지 발생하지 않습니다.</p><Button size="sm" onClick={applyBatch} disabled={isApplying || !(counts.matched + counts.new_customer + counts.x_transfer)}>{isApplying ? "반영 중..." : "선택 행 반영하기"}</Button></div>
    <div className="space-y-3">
      {visibleRows.map(({ row, candidates, exactPhone }) => {
        const current = candidates[0];
        const sourceDuplicates = sourceDuplicateRows.get(buildSourceFingerprint(row)) ?? [];
        return <article key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-900">시트 {row.sourceRowNumber}행 · {row.itemName}</p><div className="flex items-center gap-2">{sourceDuplicates.length > 1 && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">시트 원문 중복 의심 {sourceDuplicates.length}건</span>}<span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">{statusLabel[row.reviewStatus]}</span></div></div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-xs font-semibold text-gray-500">시트 원본</p><p className="mt-2 text-sm text-gray-900">{row.customerName || "이름 없음"} · {row.customerPhone || "번호 없음"}</p><p className="mt-1 break-words text-xs text-gray-600">주소: {row.customerAddress || "없음"}</p><p className="mt-1 break-words text-xs text-gray-600">특이사항: {row.customerNote || "없음"}</p></div>
            <div className="rounded-lg border border-gray-200 bg-white p-3"><p className="text-xs font-semibold text-gray-500">현재 고객 {exactPhone ? "(전화번호 정확 일치)" : "후보"}</p>{current ? <><p className="mt-2 text-sm text-gray-900">{current.name} · {current.phone}</p><p className="mt-1 break-words text-xs text-gray-600">주소: {current.address || "없음"}</p><p className="mt-1 break-words text-xs text-gray-600">특이사항: {current.note || "없음"}</p></> : <p className="mt-2 text-sm text-gray-400">일치 고객 없음</p>}</div>
            <div className="rounded-lg border border-gray-200 bg-white p-3"><p className="text-xs font-semibold text-gray-500">반영 후 예상</p><p className="mt-2 text-sm text-gray-900">{row.reviewStatus === "applied" ? "출고 이력 반영 완료" : current ? "기존 고객 연결 후보" : isKnown(row.customerName) || normalizePhone(row.customerPhone).length >= 10 ? "신규 고객 후보" : "보류 권장"}</p><p className="mt-1 text-xs text-gray-600">주소·특이사항은 고객정보를 자동 변경하지 않고, 출고 이력에만 보존합니다.</p></div>
          </div>
          {row.reviewStatus !== "applied" && <div className="mt-3 flex flex-wrap gap-2"><Button size="xs" variant="secondary" disabled={!current} onClick={() => updateRow(row, "matched", current?.id ?? null)}>기존 고객 후보로</Button><Button size="xs" variant="secondary" onClick={() => setNewCustomerGender(row, "male")}>신규 남성 고객으로</Button><Button size="xs" variant="secondary" onClick={() => setNewCustomerGender(row, "female")}>신규 여성 고객으로</Button><Button size="xs" variant="secondary" disabled={!unifiedXCustomer} onClick={() => updateRow(row, "x_transfer", unifiedXCustomer?.id ?? null)}>X 통합 계정으로</Button><Button size="xs" variant="secondary" onClick={() => updateRow(row, "hold", null)}>보류</Button>{row.reviewStatus === "hold" && <Button size="xs" variant="danger" onClick={() => removeRow(row)}>임시 행 삭제</Button>}</div>}
        </article>;
      })}
      {!visibleRows.length && <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">해당 상태의 행이 없습니다.</div>}
    </div>
  </main>;
}
