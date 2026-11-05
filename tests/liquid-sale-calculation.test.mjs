import test from "node:test";
import assert from "node:assert/strict";
import { calculateLiquidSale, formatLiquidSaleComposition } from "../src/app/_domains/_item/_utils/liquidSaleCalculation.ts";

const rules = [
  { id: "single", breath_type: "mtl", event_quantity: 1, basic_quantity: 0, sale_price: 23000 },
  { id: "pair", breath_type: "mtl", event_quantity: 2, basic_quantity: 0, sale_price: 43000 },
  { id: "a", breath_type: "mtl", event_quantity: 3, basic_quantity: 0, sale_price: 53000 },
  { id: "b", breath_type: "mtl", event_quantity: 2, basic_quantity: 1, sale_price: 58000 },
  { id: "c", breath_type: "mtl", event_quantity: 1, basic_quantity: 2, sale_price: 63000 },
  { id: "d", breath_type: "mtl", event_quantity: 0, basic_quantity: 3, sale_price: 66000 },
];
const extras = [
  { breath_type: "mtl", sale_kind: "event", additional_bottle_price: 18000 },
  { breath_type: "mtl", sale_kind: "basic", additional_bottle_price: 22000 },
  { breath_type: "dtl", sale_kind: "event", additional_bottle_price: 24000 },
  { breath_type: "dtl", sale_kind: "basic", additional_bottle_price: 28000 },
];

test("0병 분류를 판매구성 이름에서 숨긴다", () => {
  assert.equal(formatLiquidSaleComposition("mtl", 0, 2), "입호흡 · 기본 2병");
});

test("단독 1~2병은 추가 1병 금액이 아닌 판매 기준 금액을 적용한다", () => {
  assert.equal(calculateLiquidSale([{ liquidSaleKind: "mtl_event", quantity: 1 }], rules, extras).totalAmount, 23000);
  assert.equal(calculateLiquidSale([{ liquidSaleKind: "mtl_event", quantity: 2 }], rules, extras).totalAmount, 43000);
});

test("3병 구성을 우선하고 같은 병수에서는 더 높은 금액을 선택한다", () => {
  const result = calculateLiquidSale([{ liquidSaleKind: "mtl_event", quantity: 4 }, { liquidSaleKind: "mtl_basic", quantity: 2 }], rules, extras);
  assert.equal(result.totalAmount, 116000);
  assert.equal(result.appliedRules.reduce((sum, rule) => sum + rule.count, 0), 2);
});

test("이벤트와 기본이 각각 3병이면 같은 분류의 3병 구성을 먼저 적용한다", () => {
  const result = calculateLiquidSale([{ liquidSaleKind: "mtl_event", quantity: 3 }, { liquidSaleKind: "mtl_basic", quantity: 3 }], rules, extras);
  assert.equal(result.totalAmount, 119000);
  assert.deepEqual(result.appliedRules.map((rule) => rule.label).sort(), ["입호흡 · 기본 3병", "입호흡 · 이벤트 3병"]);
});

test("쿠폰 선택 분류를 먼저 차감하고 남은 병수로 계산한다", () => {
  const result = calculateLiquidSale([{ liquidSaleKind: "mtl_event", quantity: 3 }, { liquidSaleKind: "mtl_basic", quantity: 1 }], rules, extras, { breathType: "mtl", saleKind: "event", quantity: 1 });
  assert.equal(result.totalAmount, 58000);
});

test("쿠폰 대상 병수가 부족하면 계산을 막는다", () => {
  assert.throws(() => calculateLiquidSale([{ liquidSaleKind: "mtl_basic", quantity: 1 }], rules, extras, { breathType: "mtl", saleKind: "event", quantity: 1 }), /수량이 쿠폰 사용 수량보다 적습니다/);
});
