# 재고 관리 시스템

---

## 1. 테이블 구조

### 1️⃣ items_inventory

품목별 현재 재고 수량

| 컬럼     | 타입   | 설명           |
| -------- | ------ | -------------- |
| id       | PK     |                |
| items_id | FK     | items 참조     |
| quantity | number | 현재 재고 수량 |

---

### 2️⃣ items_inventory_logs

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

### 3️⃣ partners

거래처 정보

| 컬럼                   | 타입           | 설명              |
| ---------------------- | -------------- | ----------------- |
| name                   | text           | 거래처명          |
| customer_service_phone | text, nullable | 고객센터 전화번호 |
| as_service_phone       | text, nullable | A/S 전화번호      |
| note                   | text, nullable | 메모              |

---

### 4️⃣ inbound_orders

입고 주문

| 컬럼         | 타입           | 설명         |
| ------------ | -------------- | ------------ |
| id           | PK             |              |
| partner_id   | FK             | partner 참조 |
| order_date   | date           | 주문 일자    |
| inbound_date | date           | 입고 일자    |
| note         | text, nullable | 메모         |
| created_at   | timestamp      | 생성 일시    |
| updated_at   | timestamp      | 수정 일시    |

---

### 5️⃣ inbound_order_items

입고 주문 품목

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

---

## 2. 기능 계획

### 2.1 거래처 관리 (partners)

- 거래처 CRUD (이름, 고객센터/AS 전화번호, 메모)
- 입고 주문 생성 시 거래처 선택

### 2.2 재고 현황 (items_inventory)

- 품목별 현재 재고 수량 조회
- 카테고리/검색어/사용여부 필터
- 재고 상세 페이지 (품목 정보 + 현재 수량)

### 2.3 입고 관리 (inbound_orders / inbound_order_items)

- 입고 주문 등록 (거래처 + 주문일자 + 다품목)
- 입고 주문 목록 조회 (기간/품목명 필터)
- 입고 주문 상세 확인
- **2단계 처리 플로우**
  1. 수량 확인 (`is_quantity_confirmed`): 실물 수량 검수 표시
  2. 재고 반영 (`is_inventory_processed`): items_inventory 수량 가산 + inbound_date 자동 기록

### 2.4 재고 변동 이력 (items_inventory_logs) — 예정

- 입고/출고/조정 시 로그 자동 생성
- 거래처/고객/관리자/메모 기록

### 2.5 네비게이션

- 헤더에 "재고 관리" 메뉴 (`/inventory`, `/inbound` 활성화)
- 재고/입고 페이지 상단 탭 전환

---

## 3. 전체 구조 요약

도메인

- `_inventory` — 재고 조회
- `_inbound` — 입고 주문
- `_partner` — 거래처

페이지

- `/inventory` — 재고 현황 목록
- `/inventory/[id]` — 재고 상세
- `/inbound` — 입고 관리 목록

관계

```
partners 1:N inbound_orders 1:N inbound_order_items N:1 items 1:1 items_inventory
                                                                       │
                                                                       └─ 1:N items_inventory_logs
```

---

## 4. 작업 진행 사항

### DB 설계

- [x] 테이블 설계 확정 (items_inventory, items_inventory_logs, partners, inbound_orders, inbound_order_items)

### 거래처 (partners)

- [x] 도메인 추가 (services / hooks / queryKeys / types)
- [x] 거래처 목록 조회
- [x] 거래처 추가 / 수정 / 삭제
- [x] 거래처 관리 모달 (`PartnerManageModal`)

### 재고 현황 (inventory)

- [x] 도메인 추가 (services / hooks / queryKeys / types)
- [x] 재고 목록 페이지 (`/inventory`)
- [x] 검색 (카테고리 / 검색조건 / 사용여부)
- [x] 재고 상세 페이지 (`/inventory/[id]`)
- [x] 품목 정보 + 현재 수량 표시

### 입고 관리 (inbound)

- [x] 도메인 추가 (services / hooks / queryKeys / types)
- [x] 입고 목록 페이지 (`/inbound`)
- [x] 검색 (주문일자 기간 / 품목명)
- [x] 입고 주문 등록 (다품목 입력)
- [x] 입고 주문 상세 모달
- [x] 수량 확인 토글 (`is_quantity_confirmed`)
- [x] 재고 반영 (items_inventory 수량 가산 + inbound_date 기록)
- [ ] 입고 주문 수정 / 삭제

### 재고 변동 이력 (logs)

- [ ] 입고 시 자동 로그 생성
- [ ] 이력 조회 페이지
- [ ] 출고 / 재고 조정 시 로그 생성

### 공통

- [x] 품목 옵션 조회 (`getItemOptions` / `useItemOptions`) — 입고 등록용
- [x] Modal `maxWidthClassName` 옵션 (입고 모달 와이드 표시)
- [x] Dropdown 제어값 초기화 로직 개선
- [x] 헤더 "재고 관리" 메뉴 + `matchPaths` 지원
- [x] InventoryTabs (재고/입고 탭 전환)

### 미구현 / 후속 작업

- [ ] 입고 주문 수정 / 삭제 기능
- [ ] `items_inventory_logs` 기록 로직 (입고 반영 시 자동 insert)
- [ ] 출고 / 판매 처리 플로우
- [ ] 수동 재고 조정 기능
- [ ] 재고 변동 이력 조회 UI
