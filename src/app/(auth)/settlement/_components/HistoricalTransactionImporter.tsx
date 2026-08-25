"use client";

import { useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import supabase from "@/libs/supabaseClient";

const IMPORT_BATCH_ID = "historical-sales-2026-01-01_2026-05-31-v1";
const EXPECTED_HEADERS = ["매장명", "날짜", "종류", "메모", "매입가", "판매가"];
const CHUNK_SIZE = 200;

const PAYMENT_TYPE_BY_LABEL: Record<string, string> = {
  카드: "card", 이체: "transfer", 현금: "cash", 현금영수증: "cash_receipt",
  이체현금영수증: "transfer_cash_receipt", 카카오톡: "kakaotalk",
  이구베이프카드: "egu_card", 이구베이프이체: "egu_transfer",
};

const CLASSIFICATION_BY_LABEL: Record<string, string> = {
  시연용: "demo", 교환: "historical_exchange_unspecified",
  쿠폰사용: "coupon_redemption", 서비스: "service",
  관리비: "operating_expense", 배달대행비: "delivery_expense",
};

type ImportRow = {
  sourceRow: number; storeLabel: string; businessDate: string; rawType: string;
  memo: string; purchaseCost: number; salesAmount: number;
  paymentType: string; classification: string;
};

const cellText = (cell: ExcelJS.Cell) => String(cell.text ?? "").trim();

const cellNumber = (cell: ExcelJS.Cell) => {
  const value = cell.value;
  const resolved = typeof value === "object" && value !== null && "result" in value ? value.result : value;
  const number = Number(resolved);
  if (!Number.isFinite(number)) throw new Error(`${cell.address} 금액을 확인해 주세요.`);
  return Math.trunc(number);
};

const normalizeDate = (value: string) => {
  const match = value.match(/^\s*(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\s*$/);
  if (!match) throw new Error(`날짜 형식을 확인해 주세요: ${value}`);
  const [, year, month, day] = match;
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`유효하지 않은 날짜입니다: ${value}`);
  }
  return normalized;
};

const readWorkbook = async (file: File): Promise<ImportRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("첫 번째 시트를 찾을 수 없습니다.");
  const headers = EXPECTED_HEADERS.map((_, index) => cellText(worksheet.getCell(1, index + 2)));
  if (headers.some((header, index) => header !== EXPECTED_HEADERS[index])) {
    throw new Error("B~G열 헤더가 매장명/날짜/종류/메모/매입가/판매가 순서인지 확인해 주세요.");
  }

  const rows: ImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if ([2, 3, 4, 5, 6, 7].every((column) => !cellText(row.getCell(column)))) continue;
    const storeLabel = cellText(row.getCell(2));
    const rawType = cellText(row.getCell(4));
    const paymentType = PAYMENT_TYPE_BY_LABEL[rawType] ?? "shipment_remark";
    const classification = PAYMENT_TYPE_BY_LABEL[rawType] ? "payment_sale" : CLASSIFICATION_BY_LABEL[rawType];
    if (!classification) throw new Error(`${rowNumber}행 종류를 처리할 수 없습니다: ${rawType}`);
    if (storeLabel !== "오베이프" && storeLabel !== "이구베이프") {
      throw new Error(`${rowNumber}행 매장명을 확인해 주세요: ${storeLabel}`);
    }
    rows.push({
      sourceRow: rowNumber, storeLabel,
      businessDate: normalizeDate(cellText(row.getCell(3))), rawType,
      memo: cellText(row.getCell(5)), purchaseCost: cellNumber(row.getCell(6)),
      salesAmount: cellNumber(row.getCell(7)), paymentType, classification,
    });
  }
  return rows;
};

export default function HistoricalTransactionImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const summary = useMemo(() => rows.reduce((result, row) => ({
    purchaseCost: result.purchaseCost + row.purchaseCost,
    salesAmount: result.salesAmount + row.salesAmount,
    nonPaymentCount: result.nonPaymentCount + (row.classification === "payment_sale" ? 0 : 1),
  }), { purchaseCost: 0, salesAmount: 0, nonPaymentCount: 0 }), [rows]);

  const selectFile = async (file?: File) => {
    if (!file) return;
    setIsReading(true); setRows([]); setFileName(file.name); setUploadedCount(0);
    try {
      const parsed = await readWorkbook(file);
      if (parsed.length !== 2690) throw new Error(`예상 2,690건과 다릅니다: ${parsed.length.toLocaleString()}건`);
      setRows(parsed); toast.success(`${parsed.length.toLocaleString()}건을 검수했습니다.`);
    } catch (error) {
      setFileName(""); toast.error(error instanceof Error ? error.message : "엑셀 검수에 실패했습니다.");
    } finally {
      setIsReading(false); if (inputRef.current) inputRef.current.value = "";
    }
  };

  const upload = async () => {
    if (!rows.length || isUploading) return;
    setIsUploading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("로그인 세션을 확인해 주세요.");
      const userId = sessionData.session.user.id;
      const existingSourceRows = new Set<number>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("settlement_historical_transactions").select("source_row")
          .eq("source_batch_id", IMPORT_BATCH_ID)
          .range(from, from + 999);
        if (error) throw error;
        for (const item of data ?? []) {
          const sourceRow = Number(item.source_row);
          if (Number.isInteger(sourceRow)) existingSourceRows.add(sourceRow);
        }
        if ((data ?? []).length < 1000) break;
      }

      const pending = rows.filter((row) => !existingSourceRows.has(row.sourceRow));
      setUploadedCount(existingSourceRows.size);
      for (let index = 0; index < pending.length; index += CHUNK_SIZE) {
        const chunk = pending.slice(index, index + CHUNK_SIZE).map((row) => ({
          business_date: row.businessDate,
          store: row.storeLabel === "이구베이프" ? "eguvape" : "ovape",
          raw_type: row.rawType,
          memo: row.memo || null,
          purchase_cost: row.purchaseCost,
          sales_amount: row.salesAmount,
          profit: row.salesAmount - row.purchaseCost,
          classification: row.classification,
          payment_type: row.classification === "payment_sale" ? row.paymentType : null,
          source_batch_id: IMPORT_BATCH_ID,
          source_row: row.sourceRow,
          created_by: userId,
        }));
        const { error } = await supabase.from("settlement_historical_transactions").insert(chunk);
        if (error) throw error;
        setUploadedCount(existingSourceRows.size + Math.min(index + CHUNK_SIZE, pending.length));
      }

      const verifiedRows: Array<{
        business_date: string;
        purchase_cost: number;
        sales_amount: number;
        source_row: number;
      }> = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("settlement_historical_transactions")
          .select("business_date, purchase_cost, sales_amount, source_row")
          .eq("source_batch_id", IMPORT_BATCH_ID)
          .order("source_row")
          .range(from, from + 999);
        if (error) throw error;
        verifiedRows.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      const verifiedPurchaseCost = verifiedRows.reduce(
        (total, row) => total + Number(row.purchase_cost),
        0,
      );
      const verifiedSalesAmount = verifiedRows.reduce(
        (total, row) => total + Number(row.sales_amount),
        0,
      );
      const verifiedDates = verifiedRows.map((row) => row.business_date).sort();
      const uniqueSourceRows = new Set(verifiedRows.map((row) => row.source_row));
      if (
        verifiedRows.length !== rows.length ||
        uniqueSourceRows.size !== rows.length ||
        verifiedPurchaseCost !== summary.purchaseCost ||
        verifiedSalesAmount !== summary.salesAmount ||
        verifiedDates[0] !== "2026-01-01" ||
        verifiedDates.at(-1) !== "2026-05-31"
      ) {
        throw new Error("등록 후 데이터 검증 결과가 엑셀과 일치하지 않습니다.");
      }
      setUploadedCount(verifiedRows.length);
      toast.success("과거 정산 자료 2,690건을 모두 등록했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "일괄 등록에 실패했습니다.");
    } finally { setIsUploading(false); }
  };

  return (
    <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div><h1 className="text-lg font-bold text-gray-900">과거 정산 자료 등록</h1><p className="mt-1 text-sm text-gray-500">매장명, 날짜, 종류, 메모, 품목 원가, 판매가와 손익을 날짜별 개별 자료로 등록합니다.</p></div>
      <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
        <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void selectFile(event.target.files?.[0])} />
        <div className="flex flex-wrap items-center gap-3"><Button variant="gray" size="sm" disabled={isReading || isUploading} onClick={() => inputRef.current?.click()}>엑셀 선택</Button><span className="text-sm text-gray-600">{fileName || "선택된 파일 없음"}</span></div>
      </div>
      {rows.length > 0 && <div className="grid gap-3 sm:grid-cols-4">{[
        ["전체 행", `${rows.length.toLocaleString()}건`], ["품목 원가", `${summary.purchaseCost.toLocaleString()}원`],
        ["판매 매출", `${summary.salesAmount.toLocaleString()}원`], ["비결제 처리", `${summary.nonPaymentCount.toLocaleString()}건`],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 bg-gray-50/70 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-base font-bold text-gray-900">{value}</p></div>)}</div>}
      <div className="flex items-center gap-3"><Button disabled={!rows.length || isUploading || isReading} onClick={() => void upload()}>{isUploading ? `등록 중 ${uploadedCount.toLocaleString()}/${rows.length.toLocaleString()}` : "과거 정산 자료 등록"}</Button>{uploadedCount > 0 && !isUploading && <span className="text-sm font-semibold text-brand-600">등록 확인 {uploadedCount.toLocaleString()}건</span>}</div>
    </section>
  );
}
