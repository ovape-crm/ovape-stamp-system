import type { CustomerSheetImportRowInput } from "@/app/_domains/_customer/_services/customerSheetImportService";

const requiredHeaders = ["매장명", "날짜", "제품명", "이름", "핸드폰번호"];
const findColumn = (cells: string[], headers: string[], fallback: number) => {
  const index = headers.map((header) => cells.indexOf(header)).find((value) => value >= 0);
  return index ?? fallback;
};

export const parseCustomerSheetPaste = (value: string): CustomerSheetImportRowInput[] => {
  const lines = value.replace(/\r/g, "").split("\n");
  if (!lines.length) return [];
  // 시트 상단의 안내문·빈 행은 데이터가 아니다. 실제 헤더가 있는 행을 찾는다.
  const headerIndex = lines.findIndex((line) => {
    const cells = line.split("\t").map((cell) => cell.trim());
    return requiredHeaders.every((header) => cells.includes(header));
  });
  const firstCells = headerIndex >= 0 ? lines[headerIndex].split("\t").map((cell) => cell.trim()) : [];
  const hasHeader = headerIndex >= 0;
  const columns = {
    storeName: findColumn(firstCells, ["매장명"], 0), soldAtText: findColumn(firstCells, ["날짜"], 1), itemName: findColumn(firstCells, ["제품명"], 2),
    paidAmountText: findColumn(firstCells, ["결제", "판매가", "금액"], 3), paymentMethod: findColumn(firstCells, ["결제방식"], 4), customerName: findColumn(firstCells, ["이름"], 5),
    customerPhone: findColumn(firstCells, ["핸드폰번호", "전화번호"], 6), customerNote: findColumn(firstCells, ["특이사항", "비고"], 7), customerAddress: findColumn(firstCells, ["주소지", "주소"], 8),
  };
  const rows: CustomerSheetImportRowInput[] = [];
  (hasHeader ? lines.slice(headerIndex + 1) : lines).forEach((line, index) => {
    const cells = line.split("\t");
    if (cells.every((cell) => !cell.trim())) return;
    if (cells.length === 1 && rows.length) {
      // 구글시트에서 줄바꿈 된 제품명은 복사 시 단일 셀의 다음 줄로 넘어온다.
      // 제품명은 텍스트로만 보존하며 특이사항으로 옮기지 않는다.
      rows.at(-1)!.itemName = `${rows.at(-1)!.itemName}\n${cells[0].trim()}`.trim();
      return;
    }
    const row = {
      sourceRowNumber: hasHeader ? headerIndex + index + 2 : index + 1,
      storeName: cells[columns.storeName]?.trim() ?? "", soldAtText: cells[columns.soldAtText]?.trim() ?? "",
      itemName: cells[columns.itemName]?.trim() ?? "", paidAmountText: cells[columns.paidAmountText]?.trim() ?? "",
      paymentMethod: cells[columns.paymentMethod]?.trim() ?? "", customerName: cells[columns.customerName]?.trim() ?? "",
      customerPhone: cells[columns.customerPhone]?.trim() ?? "", customerNote: cells[columns.customerNote]?.trim() ?? "",
      customerAddress: cells[columns.customerAddress]?.trim() ?? "",
    };
    if (Object.values(row).some((cell) => typeof cell === "string" && cell)) rows.push(row);
  });
  return rows;
};
