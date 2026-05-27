# Inventory 테이블 구조

## items_inventory

품목별 현재 재고 수량

| 컬럼     | 타입   | 설명           |
| -------- | ------ | -------------- |
| id       | PK     |                |
| items_id | FK     | items 참조     |
| quantity | number | 현재 재고 수량 |

---

## items_inventory_logs

재고 변동 이력

| 컬럼             | 타입           | 설명                |
| ---------------- | -------------- | ------------------- |
| id               | PK             |                     |
| item_id          | FK             | items 참조          |
| quantity         | number         | 변동 수량           |
| transaction_type | -              | 거래 구분           |
| type             | nullable       | 세부 유형           |
| customer_id      | FK, nullable   | customer 참조       |
| admin_id         | FK             | created_by (관리자) |
| partner_id       | FK, nullable   | partner 참조        |
| note             | text, nullable | 메모                |

---

## partners

파트너 정보

| 컬럼                   | 타입           | 설명              |
| ---------------------- | -------------- | ----------------- |
| name                   | text           | 파트너명          |
| customer_service_phone | text, nullable | 고객센터 전화번호 |
| as_service_phone       | text, nullable | A/S 전화번호      |
| note                   | text, nullable | 메모              |

## inbound_orders

| 컬럼         | 타입           | 설명         |
| ------------ | -------------- | ------------ |
| id           | PK             |              |
| partner_id   | FK             | partner 참조 |
| order_date   | date           | 주문 일자    |
| inbound_date | date           | 입고 일자    |
| note         | text, nullable | 메모         |
| created_at   | timestamp      | 생성 일시    |
| updated_at   | timestamp      | 수정 일시    |

## inbound_order_items

| 컬럼                   | 타입           | 설명                |
| ---------------------- | -------------- | ------------------- |
| id                     | PK             |                     |
| inbound_order_id       | FK             | inbound_orders 참조 |
| item_id                | FK             | items 참조          |
| is_quantity_confirmed  | boolean        | 수량 확인 여부      |
| is_inventory_processed | boolean        | 재고 반영 여부      |
| processed_at           | timestamp      | 재고 반영 일시      |
| admin_id               | FK             | 재고 반영 관리자    |
| quantity               | number         | 수량                |
| note                   | text, nullable | 메모                |
| created_at             | timestamp      | 생성 일시           |
