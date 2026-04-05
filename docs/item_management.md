# 품목 관리 시스템

---

## 1. 테이블 구조

### 1️⃣ item_categories

품목 종류(카테고리) 관리 테이블

사용자가 카테고리를 추가 / 수정 / 삭제 / 순서 변경할 수 있음.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| name | text NOT NULL | 카테고리명 |
| order | int4 | 정렬 순서 |
| created_at | timestamptz | 생성 시간 |

예시

| id | name | order |
|----|------|-------|
| uuid-1 | 전자담배 | 1 |
| uuid-2 | 액상 | 2 |
| uuid-3 | 악세사리 | 3 |

---

### 2️⃣ items

품목 정보 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| category_id | uuid FK → item_categories.id | 종류 |
| temp_category_name | text | CSV 대량 import용 임시 카테고리명 (import 후 category_id 연결 뒤 정리) |
| item_code | text NOT NULL UNIQUE | 품목 코드 |
| item_name | text NOT NULL | 품목 명 |
| purchase_price | int4 | 매입단가 (원 단위) |
| selling_price | int4 | 매출단가 (원 단위) |
| liquid_type | text | 전자담배 액상 종류 |
| liquid_flavor | text | 전자담배 액상 맛 |
| note | text | 비고 |
| is_use | bool | 사용 여부 (false = 비활성 처리) |
| created_at | timestamptz | 생성 시간 |
| updated_at | timestamptz | 수정 시간 |

관계

```
item_categories
│
│ category_id
▼
items
```

예시 데이터

| item_code | item_name | category | purchase_price | selling_price | liquid_type | liquid_flavor | is_use |
|-----------|-----------|----------|----------------|---------------|-------------|---------------|--------|
| P001 | 아이코스 히츠 | 전자담배 | 2500 | 3500 | - | - | true |
| L001 | 쥴 민트 | 액상 | 8000 | 12000 | 폐쇄형 | 민트 | true |
| L002 | 나케드 망고 | 액상 | 9000 | 14000 | 개방형 | 망고 | true |

---

## 2. CSV 대량 Import 절차

### 순서

1. `item_categories` CSV 먼저 import (카테고리 등록)
2. `items` CSV import 시 `temp_category_name`에 카테고리명 텍스트로 입력 (`category_id` 비워둠)
3. import 완료 후 아래 SQL로 `category_id` 일괄 연결

```sql
UPDATE items i
SET category_id = c.id
FROM item_categories c
WHERE i.temp_category_name = c.name;
```

4. 연결 확인 후 `temp_category_name` 정리 (선택)

```sql
UPDATE items SET temp_category_name = NULL;
```

---

## 3. 전체 구조 요약

테이블

- item_categories
- items

관계

- item_categories 1:N items

주요 컬럼

- `item_code` — 전체 고유(UNIQUE)
- `is_use` — 삭제 대신 비활성 처리
- `temp_category_name` — CSV import 전용 임시 컬럼

---

## 4. 작업 진행 사항

- [x] 테이블 설계 확정
- [ ] 품목 목록 페이지
- [ ] 품목 추가 / 수정 / 삭제
- [ ] 카테고리 관리
- [ ] CSV 대량 import
