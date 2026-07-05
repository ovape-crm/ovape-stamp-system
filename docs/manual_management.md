# 매뉴얼 관리 시스템

---

## 1. 카테고리 구조

3단계 구조

```
탭 (고객 / 매장)        ← 하드코딩, DB에 없음
  └ 상위 타입           ← 사용자 설정 (manual_top_categories)
      └ 하위 타입       ← 사용자 설정 (manual_sub_categories)
          └ 매뉴얼      ← 실제 내용 (manuals)
```

`고객` / `매장` 탭은 코드에 상수로 박아두고, 그 아래 상위 타입 / 하위 타입만 사용자가 추가·수정·삭제·순서 변경 가능.

품목 관리(`item_categories`)와 다르게 카테고리가 2단계라서 테이블을 2개(`manual_top_categories`, `manual_sub_categories`)로 나눔. 트리 depth가 항상 정확히 2단계로 고정이라 self-reference(parent_id) 하나로 퉁치는 것보다 이렇게 나누는 게 FK 무결성 관리가 쉬움.

---

## 2. 테이블 구조

### 1️⃣ manual_top_categories

상위 타입 테이블. `탭`(고객/매장)에 종속됨.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| tab | text NOT NULL | `customer` \| `store` (하드코딩 값, CHECK 제약) |
| name | text NOT NULL | 상위 타입명 |
| order_index | int4 NOT NULL DEFAULT 0 | 정렬 순서 |
| is_use | bool NOT NULL DEFAULT true | 사용 여부 (삭제 대신 비활성 처리) |
| created_at | timestamptz DEFAULT now() | 생성 시간 |
| updated_at | timestamptz DEFAULT now() | 수정 시간 |

예시 (탭: 고객)

| id | tab | name | order_index |
|----|-----|------|-------------|
| uuid-1 | customer | 기기 사용법 | 1 |
| uuid-2 | customer | 액상 관련 | 2 |
| uuid-3 | customer | 결제/멤버십 | 3 |

---

### 2️⃣ manual_sub_categories

하위 타입 테이블. 상위 타입에 종속됨.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| top_category_id | uuid FK → manual_top_categories.id | 상위 타입 |
| name | text NOT NULL | 하위 타입명 |
| order_index | int4 NOT NULL DEFAULT 0 | 정렬 순서 |
| is_use | bool NOT NULL DEFAULT true | 사용 여부 |
| created_at | timestamptz DEFAULT now() | 생성 시간 |
| updated_at | timestamptz DEFAULT now() | 수정 시간 |

예시 (상위 타입: 기기 사용법)

| id | top_category_id | name | order_index |
|----|------------------|------|-------------|
| uuid-a | uuid-1 | 전원 켜는 법 | 1 |
| uuid-b | uuid-1 | 충전 방법 | 2 |
| uuid-c | uuid-1 | 청소 방법 | 3 |

---

### 3️⃣ manuals

실제 매뉴얼 콘텐츠. 하위 타입에 종속됨.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| sub_category_id | uuid FK → manual_sub_categories.id | 하위 타입 |
| title | text NOT NULL | 제목 |
| content | text NOT NULL | 본문 (에디터가 저장하는 포맷 그대로: html/markdown 등) |
| order_index | int4 NOT NULL DEFAULT 0 | 정렬 순서 |
| is_use | bool NOT NULL DEFAULT true | 사용 여부 |
| created_at | timestamptz DEFAULT now() | 생성 시간 |
| updated_at | timestamptz DEFAULT now() | 수정 시간 |

---

## 3. 관계도

```
manual_top_categories (tab = customer|store)
│
│ top_category_id
▼
manual_sub_categories
│
│ sub_category_id
▼
manuals
```

- manual_top_categories 1:N manual_sub_categories
- manual_sub_categories 1:N manuals

---

## 4. 화면 흐름과 매핑

고객 탭 → 매뉴얼 추가 클릭 시

1. 상위 타입 선택 → `manual_top_categories WHERE tab = 'customer' AND is_use = true ORDER BY order_index`
2. 선택한 상위 타입의 하위 타입 선택 → `manual_sub_categories WHERE top_category_id = :선택한id AND is_use = true ORDER BY order_index`
3. 내용 입력 → `manuals`에 `sub_category_id`, `title`, `content` insert

카테고리 설정 화면(품목 관리의 "품목 종류" 설정과 동일한 톤)에서는 탭별로 상위 타입 목록을 보여주고, 상위 타입을 펼치면 그 안에 속한 하위 타입 목록이 나오는 아코디언/트리 형태로 구성하면 됨.

---

## 5. SQL (Supabase에 그대로 실행)

```sql
-- 1. 상위 타입
create table manual_top_categories (
  id uuid primary key default gen_random_uuid(),
  tab text not null check (tab in ('customer', 'store')),
  name text not null,
  order_index int4 not null default 0,
  is_use bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_manual_top_categories_tab
  on manual_top_categories (tab, order_index);

-- 2. 하위 타입
create table manual_sub_categories (
  id uuid primary key default gen_random_uuid(),
  top_category_id uuid not null references manual_top_categories(id) on delete cascade,
  name text not null,
  order_index int4 not null default 0,
  is_use bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_manual_sub_categories_top_category_id
  on manual_sub_categories (top_category_id, order_index);

-- 3. 매뉴얼 본문
create table manuals (
  id uuid primary key default gen_random_uuid(),
  sub_category_id uuid not null references manual_sub_categories(id) on delete restrict,
  title text not null,
  content text not null,
  order_index int4 not null default 0,
  is_use bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_manuals_sub_category_id
  on manuals (sub_category_id, order_index);

-- updated_at 자동 갱신 트리거 (선택)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_manual_top_categories_updated_at
  before update on manual_top_categories
  for each row execute function set_updated_at();

create trigger trg_manual_sub_categories_updated_at
  before update on manual_sub_categories
  for each row execute function set_updated_at();

create trigger trg_manuals_updated_at
  before update on manuals
  for each row execute function set_updated_at();
```

`on delete cascade` / `on delete restrict`는 취향껏 조정 가능. 위 설정은 상위 타입 삭제 시 하위 타입까지 같이 지워지고(`cascade`), 매뉴얼이 남아있는 하위 타입은 삭제를 막는(`restrict`) 조합. 실무에서는 어차피 `is_use = false`로 비활성 처리하고 실제 delete는 잘 안 쓰게 될 거임.

---

## 6. 작업 진행 사항

- [x] 테이블 설계 확정
- [ ] 카테고리(상위/하위 타입) 관리 화면
- [ ] 매뉴얼 목록/추가/수정/삭제 화면
- [ ] 탭(고객/매장) 전환 UI
