import assert from "node:assert/strict";
import test from "node:test";
import { getDeliveryStampAccrualStatus } from "../src/app/_domains/_stamp/_utils/deliveryStampAccrual.ts";

test("택배·배달은 0개 적립이면 바로 진행할 수 있다", () => {
  assert.equal(
    getDeliveryStampAccrualStatus({ deliveryMethod: "parcel", amount: 0, maximum: 4 }),
    "valid_zero",
  );
});

test("택배·배달은 최대 적립 수량일 때만 적립 대상 확인을 요청한다", () => {
  assert.equal(
    getDeliveryStampAccrualStatus({ deliveryMethod: "delivery", amount: 4, maximum: 4 }),
    "requires_confirmation",
  );
});

test("택배·배달의 중간·초과 적립은 막는다", () => {
  assert.equal(
    getDeliveryStampAccrualStatus({ deliveryMethod: "parcel", amount: 2, maximum: 4 }),
    "invalid",
  );
  assert.equal(
    getDeliveryStampAccrualStatus({ deliveryMethod: "delivery", amount: 5, maximum: 4 }),
    "invalid",
  );
});

test("매장방문은 택배·배달 적립 제한을 적용하지 않는다", () => {
  assert.equal(
    getDeliveryStampAccrualStatus({ deliveryMethod: "store_visit", amount: 2, maximum: 4 }),
    null,
  );
});
