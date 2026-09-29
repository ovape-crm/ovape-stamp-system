"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import Button from "@/app/_components/Button";
import {
  createCustomerSheetImportBatch,
} from "@/app/_domains/_customer/_services/customerSheetImportService";
import { parseCustomerSheetPaste } from "@/app/_domains/_customer/_utils/customerSheetPaste";

export default function CustomerSheetImportPage() {
  const router = useRouter();
  const [sourceLabel, setSourceLabel] = useState("25.8.15 이전내역");
  const [pasteValue, setPasteValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const parsedRows = useMemo(() => parseCustomerSheetPaste(pasteValue), [pasteValue]);
  const invalidRows = parsedRows.filter((row) => !row.itemName).length;

  const save = async () => {
    if (!parsedRows.length) {
      toast.error("구글시트에서 복사한 판매 행을 붙여넣어 주세요.");
      return;
    }
    try {
      setIsSaving(true);
      const batchId = await createCustomerSheetImportBatch({
        title: "구글시트 고객 정리",
        sourceLabel,
        rows: parsedRows,
      });
      toast.success(`${parsedRows.length.toLocaleString("ko-KR")}건을 임시 작업대로 저장했습니다.`);
      router.push(`/customer-sheet-import/${batchId}`);
    } catch (error) {
      console.error(error);
      toast.error("임시 가져오기에 실패했습니다. DB 마이그레이션 적용 여부를 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">구글시트 고객 정리 작업대</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          이 단계에서는 고객과 판매 이력이 변경되지 않습니다. 시트 원문을 임시 보관한 뒤 기존 고객과 비교해 반영 대상을 고릅니다.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
        <label className="block text-sm font-semibold text-gray-800">
          원본 시트 탭
          <input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </label>
        <label className="mt-4 block text-sm font-semibold text-gray-800">
          복사한 판매 행 붙여넣기
          <textarea value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} rows={14} placeholder="매장명 · 날짜 · 제품명 · 결제 · 결제방식 · 이름 · 핸드폰번호 · 특이사항 · 주소지 순서로 구글시트에서 복사해 붙여넣으세요." className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm outline-none transition placeholder:font-normal placeholder:text-gray-500 hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
          <p>인식된 판매 행 <span className="font-semibold text-brand-600">{parsedRows.length.toLocaleString("ko-KR")}</span>건{invalidRows ? ` · 제품명 없음 ${invalidRows}건 (고객 비교에는 포함)` : ""}</p>
          <Button onClick={save} disabled={isSaving || !parsedRows.length}>{isSaving ? "저장 중..." : "임시 작업대로 저장"}</Button>
        </div>
      </section>
    </main>
  );
}
