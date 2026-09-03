import type { ServiceCostContext } from "@/app/_domains/_inventory/_services/inventoryService";

export function assessServiceCost(context: ServiceCostContext) {
  const sources = context.candidates.filter((c) => c.eligible && c.available_quantity > 0);
  const quantity = sources.reduce((sum, c) => sum + c.available_quantity, 0);
  const historical = new Date(context.event_at) < new Date("2026-07-22T00:00:00+09:00");
  const base = { sources, quantity, canPrepare: false };
  if (historical) return { ...base, status: "기록 확인 필요", reason: "7월 22일 이전 서비스입니다. 현재 기초재고와 분리된 과거 판매 원가 기준을 확인해야 합니다.", next: "과거 원가 기준의 서비스 누락분을 확인한 뒤 별도 정정해야 합니다." };
  if (quantity < context.quantity) return { ...base, status: "기록 불일치", reason: `서비스 ${context.quantity}개 / 출고일 이전 출처로 연결할 수량 ${quantity}개 → ${context.quantity - quantity}개 부족`, next: "다른 출고 배정과 원가 추가·소진 보정을 함께 대조해야 합니다. 부족분을 0원으로 처리하거나 다시 차감하지 않습니다." };
  if (quantity > context.quantity) return { ...base, status: "출처 확인 필요", reason: `서비스 ${context.quantity}개에 대해 같은 품목의 소진 기록 ${quantity}개가 있습니다. 다른 서비스나 보정 수량이 섞일 수 있습니다.`, next: "이 품목의 서비스와 판매를 날짜순으로 대조해야 합니다. 일부 원가층을 임의로 선택하지 않습니다." };
  if (sources.some((c) => c.unit_cost === null || c.unit_cost === 0)) return { ...base, status: "단가 확인 필요", reason: "수량은 맞지만 미확정 또는 0원으로 기록된 단가가 있습니다.", next: "실제 입고 단가 또는 무상 입고 근거를 확인해야 합니다. 판매금액 0원은 원가 0원의 근거가 아닙니다." };
  return { ...base, canPrepare: true, status: "수량 근거 일치", reason: `서비스 ${context.quantity}개와 출고일 이전 출처의 소진 ${quantity}개가 일치합니다.`, next: "아래 계산은 기존 소진 기록 기준의 검토안입니다. 실제 해당 서비스의 소진인지 확인한 뒤 적용하세요. 자동 확정하지 않습니다." };
}

export function serviceCostFormula(lines: { quantity: number; unit_cost: number | null }[]) {
  if (!lines.length) return "원가 미확정";
  const grouped = new Map<number | null, number>();
  for (const line of lines) grouped.set(line.unit_cost, (grouped.get(line.unit_cost) ?? 0) + line.quantity);
  const terms = [...grouped].map(([price, qty]) => `${qty.toLocaleString("ko-KR")}개 × ${price === null ? "미확정" : `${price.toLocaleString("ko-KR")}원`}`);
  const total = lines.some((l) => l.unit_cost === null) ? "미확정" : `${lines.reduce((sum, l) => sum + l.quantity * l.unit_cost!, 0).toLocaleString("ko-KR")}원`;
  return `${terms.join(" + ")} = ${total}`;
}
