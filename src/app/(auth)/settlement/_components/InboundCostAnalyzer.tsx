"use client";

import { ChangeEvent, Fragment, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Button from "@/app/_components/Button";
import { saveSettlementUnifiedItemCostsBulk } from "@/app/_domains/_settlement/_services/settlementService";
import { SettlementSoldItem } from "@/app/_domains/_settlement/_types/settlement.types";

type InboundRow = {
  rowNumber: number;
  date: string;
  supplier: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  memo: string;
  issuance: string;
};

type SegmentDraft = { quantity: string; unitCost: string };
type ReviewStatus = "matched" | "review" | "invalid" | "unmatched";
type ReviewRow = {
  itemId: number | null;
  itemName: string;
  soldQuantity: number;
  openingQuantity: number;
  matchedName: string;
  latestDate: string;
  inboundRows: InboundRow[];
  candidates: { name: string; score: number }[];
  segments: SegmentDraft[];
  status: ReviewStatus;
  reasons: string[];
  excluded: boolean;
};

type Filter = "all" | ReviewStatus | "excluded";

const normalizeName = (value: string) =>
  value
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .replaceAll(/[^가-힣a-z0-9]/g, "");

const similarity = (left: string, right: string) => {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left))
    return (
      Math.min(left.length, right.length) / Math.max(left.length, right.length)
    );
  const pairs = (value: string) =>
    Array.from({ length: Math.max(0, value.length - 1) }, (_, index) =>
      value.slice(index, index + 2),
    );
  const rightPairs = pairs(right);
  let matches = 0;
  for (const pair of pairs(left)) {
    const index = rightPairs.indexOf(pair);
    if (index >= 0) {
      matches += 1;
      rightPairs.splice(index, 1);
    }
  }
  return (2 * matches) / Math.max(1, left.length + right.length - 2);
};

const readNumber = (cell: { value: unknown; result?: unknown }) => {
  const source =
    typeof cell.value === "object" && cell.value && "result" in cell.value
      ? (cell.value as { result?: unknown }).result
      : cell.value;
  const number = Number(source);
  return Number.isFinite(number) ? number : NaN;
};

const readDate = (cell: { value: unknown; text: string }) => {
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  const korean = cell.text.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (korean)
    return `${korean[1]}-${korean[2].padStart(2, "0")}-${korean[3].padStart(2, "0")}`;
  const plain = cell.text.match(/(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  return plain
    ? `${plain[1]}-${plain[2].padStart(2, "0")}-${plain[3].padStart(2, "0")}`
    : "";
};

const combineSegments = (segments: { quantity: number; unitCost: number }[]) =>
  segments.reduce<{ quantity: number; unitCost: number }[]>(
    (result, segment) => {
      const previous = result.at(-1);
      if (previous?.unitCost === segment.unitCost)
        previous.quantity += segment.quantity;
      else result.push({ ...segment });
      return result;
    },
    [],
  );

const buildReviewRows = (
  inbounds: InboundRow[],
  items: SettlementSoldItem[],
  forcedMatches: Record<string, string> = {},
) => {
  const groups = new Map<string, InboundRow[]>();
  for (const row of inbounds) {
    const key = normalizeName(row.itemName);
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  return items
    .filter((item) => item.soldBeforeBaseline > 0 || item.openingQuantity > 0)
    .map<ReviewRow>((item) => {
      const totalQuantity = item.soldBeforeBaseline + item.openingQuantity;
      const normalizedItemName = normalizeName(item.itemName);
      const candidates = [...groups.entries()]
        .map(([key, rows]) => ({
          name: rows[0]?.itemName ?? "",
          score: similarity(normalizedItemName, key),
        }))
        .filter((candidate) => candidate.name)
        .sort((left, right) => right.score - left.score)
        .slice(0, 8);
      const forcedName = forcedMatches[item.itemName];
      const selectedName =
        forcedName ??
        (groups.has(normalizedItemName)
          ? item.itemName
          : candidates[0]?.score >= 0.48
            ? candidates[0].name
            : "");
      const matched = (groups.get(normalizeName(selectedName)) ?? []).sort(
        (left, right) =>
          left.date.localeCompare(right.date) ||
          left.rowNumber - right.rowNumber,
      );
      const eligible = matched.filter((row) => row.date <= "2026-07-22");
      const relevant = matched.filter(
        (row) => row.date >= "2026-06-01" && row.date <= "2026-07-22",
      );
      const invalid = relevant.filter(
        (row) => row.quantity <= 0 || row.unitCost <= 0,
      );
      const positiveRelevant = relevant.filter(
        (row) => row.quantity > 0 && row.unitCost > 0,
      );
      const prior = matched
        .filter(
          (row) =>
            row.date < "2026-06-01" && row.quantity > 0 && row.unitCost > 0,
        )
        .at(-1);
      const relevantQuantity = positiveRelevant.reduce(
        (total, row) => total + row.quantity,
        0,
      );
      let remaining = totalQuantity;
      const recommended: { quantity: number; unitCost: number }[] = [];
      const startingQuantity = Math.max(0, totalQuantity - relevantQuantity);
      if (startingQuantity > 0 && prior) {
        recommended.push({
          quantity: startingQuantity,
          unitCost: Math.round(prior.unitCost),
        });
        remaining -= startingQuantity;
      }
      for (const row of positiveRelevant) {
        if (remaining <= 0) break;
        const quantity = Math.min(remaining, Math.floor(row.quantity));
        if (quantity > 0)
          recommended.push({ quantity, unitCost: Math.round(row.unitCost) });
        remaining -= quantity;
      }
      if (remaining > 0 && (positiveRelevant.at(-1) ?? prior)) {
        const fallback = positiveRelevant.at(-1) ?? prior!;
        recommended.push({
          quantity: remaining,
          unitCost: Math.round(fallback.unitCost),
        });
        remaining = 0;
      }
      const segments = combineSegments(recommended);
      const distinctCosts = new Set(
        positiveRelevant.map((row) => Math.round(row.unitCost)),
      );
      const reasons: string[] = [];
      if (!matched.length) reasons.push("엑셀 품목명 미매칭");
      else if (normalizeName(selectedName) !== normalizedItemName)
        reasons.push(`유사 품목 추천: ${selectedName}`);
      if (!segments.length) reasons.push("사용 가능한 정상 원가 없음");
      if (invalid.length)
        reasons.push(`0원·음수 수량/단가 ${invalid.length}건`);
      if (distinctCosts.size > 1)
        reasons.push(`기간 중 원가 ${distinctCosts.size}종`);
      if (relevantQuantity !== totalQuantity)
        reasons.push(
          `기간 입고 ${relevantQuantity}개 / 필요 ${totalQuantity}개`,
        );
      const status: ReviewStatus = !matched.length
        ? "unmatched"
        : invalid.length || !segments.length
          ? "invalid"
          : reasons.length
            ? "review"
            : "matched";
      return {
        itemId: item.itemId,
        itemName: item.itemName,
        soldQuantity: item.soldBeforeBaseline,
        openingQuantity: item.openingQuantity,
        matchedName: matched[0]?.itemName ?? "",
        latestDate: eligible.at(-1)?.date ?? "",
        inboundRows: matched,
        candidates,
        segments: segments.map((segment) => ({
          quantity: String(segment.quantity),
          unitCost: String(segment.unitCost),
        })),
        status,
        reasons,
        excluded: status === "invalid" || status === "unmatched",
      };
    });
};

const statusLabel: Record<ReviewStatus, string> = {
  matched: "자동매칭",
  review: "확인 필요",
  invalid: "0원·음수 확인",
  unmatched: "이름 미매칭",
};

const statusClass: Record<ReviewStatus, string> = {
  matched: "bg-emerald-50 text-emerald-700",
  review: "bg-amber-50 text-amber-700",
  invalid: "bg-red-50 text-red-700",
  unmatched: "bg-red-50 text-red-700",
};

export default function InboundCostAnalyzer({
  items,
}: {
  items: SettlementSoldItem[];
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [inbounds, setInbounds] = useState<InboundRow[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [reading, setReading] = useState(false);

  const saveMutation = useMutation({
    mutationFn: saveSettlementUnifiedItemCostsBulk,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["settlement-cost-items"],
      });
      setConfirming(false);
      toast.success(`${variables.length}개 품목의 확정 원가를 저장했습니다.`);
    },
    onError: () => toast.error("확정 원가 저장에 실패했습니다."),
  });

  const analyze = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReading(true);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet =
        workbook.getWorksheet("입고정리") ?? workbook.worksheets[0];
      if (!worksheet) throw new Error("엑셀 시트를 찾을 수 없습니다.");
      const headers = [2, 3, 4, 5, 6].map((column) =>
        worksheet.getRow(4).getCell(column).text.replaceAll(/\s/g, ""),
      );
      if (headers.join("|") !== "도매처|주문날짜|제품명|수량|매입가")
        throw new Error("입고정리 시트의 B4:F4 열을 확인해 주세요.");
      const parsed: InboundRow[] = [];
      for (let rowNumber = 5; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const date = readDate(row.getCell(3));
        const itemName = row.getCell(4).text.trim();
        if (!date || !itemName) continue;
        parsed.push({
          rowNumber,
          date,
          supplier: row.getCell(2).text.trim(),
          itemName,
          quantity: readNumber(row.getCell(5)),
          unitCost: readNumber(row.getCell(6)),
          memo: [row.getCell(8).text.trim(), row.getCell(9).text.trim()]
            .filter(Boolean)
            .join(" / "),
          issuance: row.getCell(10).text.trim(),
        });
      }
      setRows(buildReviewRows(parsed, items));
      setInbounds(parsed);
      setFileName(file.name);
      setConfirming(false);
      toast.success(
        "입고 원가 분석이 완료되었습니다. 아직 저장되지 않았습니다.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "엑셀 분석에 실패했습니다.",
      );
    } finally {
      setReading(false);
    }
  };

  const updateRow = (
    itemName: string,
    updater: (row: ReviewRow) => ReviewRow,
  ) =>
    setRows((current) =>
      current.map((row) => (row.itemName === itemName ? updater(row) : row)),
    );
  const selectCandidate = (row: ReviewRow, matchedName: string) => {
    const sourceItem = items.find((item) => item.itemName === row.itemName);
    if (!sourceItem) return;
    const rebuilt = buildReviewRows(inbounds, [sourceItem], {
      [row.itemName]: matchedName,
    })[0];
    if (rebuilt)
      setRows((current) =>
        current.map((item) =>
          item.itemName === row.itemName ? rebuilt : item,
        ),
      );
  };
  const included = rows.filter((row) => !row.excluded);
  const invalidIncluded = included.filter((row) => {
    const total = row.soldQuantity + row.openingQuantity;
    return (
      !row.segments.length ||
      row.segments.some(
        (segment) =>
          !Number.isInteger(Number(segment.quantity)) ||
          Number(segment.quantity) <= 0 ||
          !Number.isInteger(Number(segment.unitCost)) ||
          Number(segment.unitCost) < 0,
      ) ||
      row.segments.reduce(
        (sum, segment) => sum + Number(segment.quantity || 0),
        0,
      ) !== total
    );
  });
  const visible = useMemo(() => {
    const keyword = normalizeName(search);
    return rows.filter(
      (row) =>
        (filter === "all" ||
          (filter === "excluded" ? row.excluded : row.status === filter)) &&
        (!keyword || normalizeName(row.itemName).includes(keyword)),
    );
  }, [filter, rows, search]);
  const expectedCost = included.reduce(
    (total, row) =>
      total +
      row.segments.reduce(
        (subtotal, segment) =>
          subtotal +
          Number(segment.quantity || 0) * Number(segment.unitCost || 0),
        0,
      ),
    0,
  );

  const confirmSave = () => {
    if (invalidIncluded.length)
      return toast.error(
        `수량 또는 원가를 확인할 품목이 ${invalidIncluded.length}개 있습니다.`,
      );
    if (!included.length) return toast.error("저장할 품목이 없습니다.");
    if (!confirming) return setConfirming(true);
    saveMutation.mutate(
      included.map((row) => ({
        itemId: row.itemId,
        itemName: row.itemName,
        soldQuantity: row.soldQuantity,
        openingQuantity: row.openingQuantity,
        segments: row.segments.map((segment) => ({
          quantity: Number(segment.quantity),
          unitCost: Number(segment.unitCost),
        })),
      })),
    );
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">
            입고 엑셀 원가 분석
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            6/1~7/21 판매분과 7/22 기초재고의 추천 원가를 검토합니다. 엑셀
            선택만으로는 저장되지 않습니다. 미매칭·0원·음수 행도 수정할 수
            있으며, 수정 후 포함한 품목만 저장됩니다.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={analyze}
          />
          <Button
            type="button"
            variant="gray"
            disabled={reading}
            onClick={() => inputRef.current?.click()}
          >
            {reading ? "분석 중..." : "입고 엑셀 선택"}
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-gray-200 pt-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["파일", fileName],
              ["분석 품목", `${rows.length.toLocaleString()}개`],
              [
                "자동매칭",
                `${rows.filter((row) => row.status === "matched").length.toLocaleString()}개`,
              ],
              [
                "확인 필요",
                `${rows.filter((row) => row.status !== "matched").length.toLocaleString()}개`,
              ],
              ["저장 상태", "미적용"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-1 truncate text-sm font-bold text-gray-900">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium shadow-sm"
            >
              <option value="all">전체</option>
              <option value="matched">자동매칭</option>
              <option value="review">원가·수량 확인</option>
              <option value="invalid">0원·음수 확인</option>
              <option value="unmatched">이름 미매칭</option>
              <option value="excluded">적용 제외</option>
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="품목명 검색"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium shadow-sm outline-none sm:max-w-sm"
            />
            <span className="text-xs text-gray-600">
              {visible.length}/{rows.length}
            </span>
          </div>

          <div className="max-h-[620px] overflow-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[1080px] text-xs">
              <thead className="sticky top-0 z-10 bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">앱 품목명</th>
                  <th className="px-3 py-2 text-right">판매</th>
                  <th className="px-3 py-2 text-right">기초재고</th>
                  <th className="px-3 py-2">최근 입고</th>
                  <th className="px-3 py-2">적용 원가 구간</th>
                  <th className="px-3 py-2 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((row) => (
                  <Fragment key={row.itemName}>
                    <tr
                      className={
                        row.excluded
                          ? "bg-gray-50 text-gray-400"
                          : "text-gray-700"
                      }
                    >
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 font-semibold ${statusClass[row.status]}`}
                        >
                          {statusLabel[row.status]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-bold text-gray-900">
                          {row.itemName}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {row.reasons.join(" · ") || row.matchedName}
                        </p>
                        {(row.candidates.length > 0 || row.matchedName) && (
                          <select
                            aria-label={`${row.itemName} 엑셀 품목 선택`}
                            value={row.matchedName}
                            onChange={(event) =>
                              selectCandidate(row, event.target.value)
                            }
                            className="mt-2 h-8 w-full max-w-[280px] cursor-pointer rounded border border-gray-300 bg-white px-2 text-xs text-gray-900"
                          >
                            <option value="">엑셀 품목 직접 선택</option>
                            {[
                              ...(row.matchedName
                                ? [{ name: row.matchedName, score: 1 }]
                                : []),
                              ...row.candidates,
                            ]
                              .filter(
                                (candidate, index, list) =>
                                  list.findIndex(
                                    (item) => item.name === candidate.name,
                                  ) === index,
                              )
                              .map((candidate) => (
                                <option
                                  key={candidate.name}
                                  value={candidate.name}
                                >
                                  {candidate.name} · 유사도{" "}
                                  {Math.round(candidate.score * 100)}%
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {row.soldQuantity}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {row.openingQuantity}
                      </td>
                      <td className="px-3 py-3">{row.latestDate || "—"}</td>
                      <td className="px-3 py-3">
                        <div className="space-y-1.5">
                          {row.segments.map((segment, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-1"
                            >
                              <input
                                aria-label={`${row.itemName} ${index + 1}차 수량`}
                                value={segment.quantity}
                                onChange={(event) =>
                                  updateRow(row.itemName, (current) => ({
                                    ...current,
                                    segments: current.segments.map(
                                      (item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              quantity: event.target.value,
                                            }
                                          : item,
                                    ),
                                  }))
                                }
                                className="h-8 w-20 rounded border border-gray-300 px-2 text-right"
                              />
                              <span>개 ×</span>
                              <input
                                aria-label={`${row.itemName} ${index + 1}차 원가`}
                                value={segment.unitCost}
                                onChange={(event) =>
                                  updateRow(row.itemName, (current) => ({
                                    ...current,
                                    segments: current.segments.map(
                                      (item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              unitCost: event.target.value,
                                            }
                                          : item,
                                    ),
                                  }))
                                }
                                className="h-8 w-24 rounded border border-gray-300 px-2 text-right"
                              />
                              <span>원</span>
                              <button
                                type="button"
                                disabled={row.segments.length === 1}
                                onClick={() =>
                                  updateRow(row.itemName, (current) => ({
                                    ...current,
                                    segments: current.segments.filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  }))
                                }
                                className="cursor-pointer px-1 text-red-500 disabled:cursor-not-allowed disabled:text-gray-300"
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              updateRow(row.itemName, (current) => ({
                                ...current,
                                segments: [
                                  ...current.segments,
                                  { quantity: "", unitCost: "" },
                                ],
                              }))
                            }
                            className="cursor-pointer text-brand-600"
                          >
                            원가 구간 추가
                          </button>
                          {row.inboundRows.some(
                            (inbound) => inbound.unitCost > 0,
                          ) && (
                            <div className="flex max-w-[420px] flex-wrap gap-1 border-t border-gray-100 pt-1.5">
                              <span className="mr-1 py-1 text-[11px] text-gray-500">
                                전체 입고 단가
                              </span>
                              {[
                                ...new Set(
                                  row.inboundRows
                                    .filter((inbound) => inbound.unitCost > 0)
                                    .map((inbound) =>
                                      Math.round(inbound.unitCost),
                                    ),
                                ),
                              ].map((unitCost) => (
                                <button
                                  key={unitCost}
                                  type="button"
                                  title="모든 원가 구간에 적용"
                                  onClick={() =>
                                    updateRow(row.itemName, (current) => ({
                                      ...current,
                                      segments: current.segments.length
                                        ? current.segments.map((segment) => ({
                                            ...segment,
                                            unitCost: String(unitCost),
                                          }))
                                        : [
                                            {
                                              quantity: String(
                                                current.soldQuantity +
                                                  current.openingQuantity,
                                              ),
                                              unitCost: String(unitCost),
                                            },
                                          ],
                                    }))
                                  }
                                  className="cursor-pointer rounded-md border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-700 hover:border-brand-300 hover:text-brand-600"
                                >
                                  {unitCost.toLocaleString()}원
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded(
                                expanded === row.itemName ? "" : row.itemName,
                              )
                            }
                            className="cursor-pointer font-semibold text-gray-600"
                          >
                            근거
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateRow(row.itemName, (current) => ({
                                ...current,
                                excluded: !current.excluded,
                              }))
                            }
                            className="cursor-pointer font-semibold text-brand-600"
                          >
                            {row.excluded ? "포함" : "제외"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === row.itemName && (
                      <tr key={`${row.itemName}-detail`}>
                        <td colSpan={7} className="bg-gray-50 px-4 py-3">
                          <div className="max-h-44 overflow-auto">
                            <table className="w-full min-w-[760px]">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="py-1 text-left">행</th>
                                  <th className="text-left">입고일</th>
                                  <th className="text-left">도매처</th>
                                  <th className="text-right">수량</th>
                                  <th className="text-right">개당 원가</th>
                                  <th className="text-left">발행 종류</th>
                                  <th className="text-left">메모</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.inboundRows.map((inbound) => (
                                  <tr key={inbound.rowNumber}>
                                    <td className="py-1">
                                      {inbound.rowNumber}
                                    </td>
                                    <td>{inbound.date}</td>
                                    <td>{inbound.supplier}</td>
                                    <td className="text-right">
                                      {inbound.quantity}
                                    </td>
                                    <td className="text-right">
                                      {inbound.unitCost.toLocaleString()}원
                                    </td>
                                    <td>{inbound.issuance || "—"}</td>
                                    <td>{inbound.memo || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-bold text-gray-900">
                저장 후보 {included.length}개
              </span>
              <span className="mx-2">·</span>예상 총원가{" "}
              {Math.round(expectedCost).toLocaleString()}원
              {invalidIncluded.length > 0 && (
                <span className="ml-2 font-semibold text-red-600">
                  수량·원가 오류 {invalidIncluded.length}개
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {confirming && (
                <span className="text-xs font-semibold text-red-600">
                  검토한 값으로 실제 저장합니다.
                </span>
              )}
              <Button
                type="button"
                disabled={saveMutation.isPending}
                onClick={confirmSave}
              >
                {saveMutation.isPending
                  ? "저장 중..."
                  : confirming
                    ? "확정 원가 저장"
                    : "검토 완료"}
              </Button>
              {confirming && (
                <Button
                  type="button"
                  variant="gray"
                  onClick={() => setConfirming(false)}
                >
                  취소
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
