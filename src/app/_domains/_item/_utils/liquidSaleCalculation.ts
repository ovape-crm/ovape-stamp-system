import type { LiquidSaleExtraBottlePrice } from "@/app/_domains/_item/_services/liquidSalePriceRuleService";
import type { LiquidSalePriceRule } from "@/app/_domains/_item/_types/liquidSalePriceRule.types";

export type LiquidBreath = "mtl" | "dtl";
export type LiquidKind = "event" | "basic";
export type LiquidSaleKind = `${LiquidBreath}_${LiquidKind}`;

export type LiquidSaleInput = { liquidSaleKind?: string | null; quantity: number };
export type LiquidCouponSelection = { breathType: LiquidBreath; saleKind: LiquidKind; quantity: number };
export type LiquidSaleAppliedRule = { breathType: LiquidBreath; eventQuantity: number; basicQuantity: number; salePrice: number; count: number; label: string };
export type LiquidSaleCalculation = {
  totalAmount: number;
  appliedRules: LiquidSaleAppliedRule[];
  additionalBottles: Array<{ breathType: LiquidBreath; saleKind: LiquidKind; quantity: number; unitPrice: number; label: string }>;
  coupon?: LiquidCouponSelection;
  quantities: Record<LiquidSaleKind, number>;
};

export const formatLiquidSaleComposition = (breathType: LiquidBreath, eventQuantity: number, basicQuantity: number) => {
  const breath = breathType === "mtl" ? "입호흡" : "폐호흡";
  const parts = [eventQuantity > 0 ? `이벤트 ${eventQuantity}병` : "", basicQuantity > 0 ? `기본 ${basicQuantity}병` : ""].filter(Boolean);
  return `${breath} · ${parts.join(" + ")}`;
};

const blankQuantities = (): Record<LiquidSaleKind, number> => ({ mtl_event: 0, mtl_basic: 0, dtl_event: 0, dtl_basic: 0 });

export const calculateLiquidSale = (inputs: LiquidSaleInput[], rules: LiquidSalePriceRule[], extraPrices: LiquidSaleExtraBottlePrice[], coupon?: LiquidCouponSelection): LiquidSaleCalculation => {
  const quantities = blankQuantities();
  for (const input of inputs) {
    if (input.liquidSaleKind && input.liquidSaleKind in quantities) quantities[input.liquidSaleKind as LiquidSaleKind] += Math.max(0, input.quantity);
  }
  if (coupon) {
    const key = `${coupon.breathType}_${coupon.saleKind}` as LiquidSaleKind;
    if (quantities[key] < coupon.quantity) throw new Error(`${coupon.breathType === "mtl" ? "입호흡" : "폐호흡"} · ${coupon.saleKind === "event" ? "이벤트" : "기본"} 액상 수량이 쿠폰 사용 수량보다 적습니다.`);
    quantities[key] -= coupon.quantity;
  }
  const appliedRules: LiquidSaleAppliedRule[] = [];
  const additionalBottles: LiquidSaleCalculation["additionalBottles"] = [];
  let totalAmount = 0;
  for (const breathType of ["mtl", "dtl"] as const) {
    const startEvent = quantities[`${breathType}_event`];
    const startBasic = quantities[`${breathType}_basic`];
    const bottleCount = startEvent + startBasic;
    if (bottleCount > 0 && bottleCount < 3) {
      const singleRule = rules.find((rule) => rule.breath_type === breathType && rule.event_quantity === startEvent && rule.basic_quantity === startBasic);
      if (!singleRule) throw new Error(`${formatLiquidSaleComposition(breathType, startEvent, startBasic)} 판매 기준이 등록되지 않았습니다.`);
      appliedRules.push({ breathType, eventQuantity: startEvent, basicQuantity: startBasic, salePrice: singleRule.sale_price, count: 1, label: formatLiquidSaleComposition(breathType, startEvent, startBasic) });
      totalAmount += singleRule.sale_price;
      continue;
    }
    const bundleRules = rules.filter((rule) => rule.breath_type === breathType && rule.event_quantity + rule.basic_quantity === 3);
    const pureEventRule = bundleRules.find((rule) => rule.event_quantity === 3 && rule.basic_quantity === 0);
    const pureBasicRule = bundleRules.find((rule) => rule.event_quantity === 0 && rule.basic_quantity === 3);
    const purePicks: LiquidSalePriceRule[] = [];
    let remainingEvent = startEvent;
    let remainingBasic = startBasic;
    if (pureEventRule) for (let index = 0; index < Math.floor(startEvent / 3); index += 1) { purePicks.push(pureEventRule); remainingEvent -= 3; }
    if (pureBasicRule) for (let index = 0; index < Math.floor(startBasic / 3); index += 1) { purePicks.push(pureBasicRule); remainingBasic -= 3; }
    let best: { count: number; price: number; picks: LiquidSalePriceRule[] } = { count: -1, price: -1, picks: [] };
    const search = (event: number, basic: number, picks: LiquidSalePriceRule[], price: number) => {
      const candidate = { count: picks.length, price, picks };
      if (candidate.count > best.count || (candidate.count === best.count && candidate.price > best.price)) best = candidate;
      for (const rule of bundleRules) if (rule.event_quantity <= event && rule.basic_quantity <= basic) search(event - rule.event_quantity, basic - rule.basic_quantity, [...picks, rule], price + rule.sale_price);
    };
    search(remainingEvent, remainingBasic, [], 0);
    if (best.count < Math.floor((remainingEvent + remainingBasic) / 3)) {
      throw new Error(`${breathType === "mtl" ? "입호흡" : "폐호흡"} 액상 판매 구성이 등록되지 않았습니다.`);
    }
    const selectedPicks = [...purePicks, ...best.picks];
    const usedEvent = selectedPicks.reduce((sum, rule) => sum + rule.event_quantity, 0);
    const usedBasic = selectedPicks.reduce((sum, rule) => sum + rule.basic_quantity, 0);
    const grouped = new Map<string, LiquidSaleAppliedRule>();
    for (const rule of selectedPicks) {
      const key = `${rule.event_quantity}:${rule.basic_quantity}:${rule.sale_price}`;
      const found = grouped.get(key);
      if (found) found.count += 1;
      else grouped.set(key, { breathType, eventQuantity: rule.event_quantity, basicQuantity: rule.basic_quantity, salePrice: rule.sale_price, count: 1, label: formatLiquidSaleComposition(breathType, rule.event_quantity, rule.basic_quantity) });
    }
    appliedRules.push(...grouped.values()); totalAmount += selectedPicks.reduce((sum, rule) => sum + rule.sale_price, 0);
    for (const [saleKind, quantity] of [["event", startEvent - usedEvent], ["basic", startBasic - usedBasic]] as const) {
      if (!quantity) continue;
      const price = extraPrices.find((row) => row.breath_type === breathType && row.sale_kind === saleKind)?.additional_bottle_price;
      if (price === undefined) throw new Error(`${breathType === "mtl" ? "입호흡" : "폐호흡"} · ${saleKind === "event" ? "이벤트" : "기본"} 추가 1병 금액이 등록되지 않았습니다.`);
      additionalBottles.push({ breathType, saleKind, quantity, unitPrice: price, label: `${breathType === "mtl" ? "입호흡" : "폐호흡"} · ${saleKind === "event" ? "이벤트" : "기본"} 추가 ${quantity}병` }); totalAmount += quantity * price;
    }
  }
  return { totalAmount, appliedRules, additionalBottles, coupon, quantities };
};
