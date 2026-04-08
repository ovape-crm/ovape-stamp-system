# 폴더 구조

## 전체 구조

```
src/
├── libs/
│   └── supabaseClient.ts          # Supabase 클라이언트 싱글턴
│
└── app/
    ├── (auth)/                    # 로그인 필요 라우트 그룹
    │   ├── _components/           # auth 레이아웃 공통 컴포넌트
    │   │   ├── Header/
    │   │   └── HistoriesComponents/
    │   ├── after-services/        # AS 관리 페이지
    │   ├── comparison/            # 기기 비교 페이지
    │   ├── customers/             # 고객 관리 페이지
    │   │   └── [id]/              # 고객 상세 페이지
    │   ├── histories/             # 히스토리 페이지
    │   └── layout.tsx
    │
    ├── (public)/                  # 로그인 불필요 라우트 그룹
    │   ├── login/
    │   └── page.tsx
    │
    ├── _domains/                  # 도메인별 비즈니스 로직
    │   ├── _afterService/
    │   │   ├── _hooks/
    │   │   │   ├── useAfterService.ts
    │   │   │   └── useAfterServices.ts
    │   │   ├── _queryKeys/
    │   │   │   └── afterServiceKeys.ts
    │   │   └── _services/
    │   │       └── afterService.ts
    │   │
    │   ├── _comparison/
    │   │   ├── _hooks/
    │   │   │   └── useComparisonColumns.ts
    │   │   ├── _queryKeys/
    │   │   │   └── comparisonKeys.ts
    │   │   ├── _services/
    │   │   │   ├── comparisonColumnService.ts
    │   │   │   └── comparisonDeviceService.ts
    │   │   └── _types/
    │   │       └── comparison.types.ts
    │   │
    │   ├── _customer/
    │   │   ├── _hooks/
    │   │   │   ├── useCustomer.ts
    │   │   │   └── useCustomers.ts
    │   │   ├── _queryKeys/
    │   │   │   └── customerKeys.ts
    │   │   ├── _services/
    │   │   │   └── customerService.ts
    │   │   └── _types/
    │   │       └── customer.types.ts
    │   │
    │   ├── _item/                 # 품목 관리 (작업 예정)
    │   │   ├── _hooks/
    │   │   ├── _queryKeys/
    │   │   ├── _services/
    │   │   └── _types/
    │   │
    │   ├── _log/
    │   │   ├── _hooks/
    │   │   │   ├── useCopy.ts
    │   │   │   ├── useLogs.ts
    │   │   │   ├── useLogsByAfterServiceId.ts
    │   │   │   └── useLogsByCustomerId.ts
    │   │   ├── _queryKeys/
    │   │   │   └── logKeys.ts
    │   │   ├── _services/
    │   │   │   └── logService.ts
    │   │   └── _types/
    │   │       └── log.types.ts
    │   │
    │   ├── _stamp/
    │   │   └── _services/
    │   │       └── stampService.ts
    │   │
    │   └── _user/
    │       └── _types/
    │           └── user.types.ts
    │
    ├── _components/               # 앱 전역 공통 컴포넌트
    │   ├── Button/
    │   ├── DateRangePicker/
    │   ├── Drawer/
    │   ├── Dropdown/
    │   ├── MenuPopover/
    │   ├── Loading.tsx
    │   └── NotFoundView.tsx
    │
    ├── _contexts/                 # 전역 Context
    │   ├── ModalContext.tsx
    │   ├── QueryProvider.tsx
    │   └── UserContext.tsx
    │
    ├── _enums/                    # 전역 Enum 상수
    │   └── enums.ts
    │
    ├── _utils/                    # 전역 유틸 함수
    │   ├── scrollLock.ts
    │   └── utils.ts
    │
    ├── globals.css
    ├── layout.tsx
    └── not-found.tsx
```

---

## 구조 원칙

### 도메인 (`_domains/`)
비즈니스 로직의 핵심. 각 도메인은 독립적인 하위 폴더 구조를 가짐.

| 폴더 | 역할 |
|------|------|
| `_types/` | TypeScript 타입 정의 |
| `_services/` | Supabase API 호출 함수 |
| `_queryKeys/` | React Query 키 관리 |
| `_hooks/` | React Query 기반 커스텀 훅 |

### 글로벌 (`_components`, `_contexts`, `_enums`, `_utils`)
도메인에 종속되지 않고 앱 전체에서 공통으로 사용하는 것들.

### 라우트 그룹 (`(auth)`, `(public)`)
Next.js App Router 라우트 그룹. 각 페이지 내 `_components/`는 해당 페이지 전용 컴포넌트.

---

## 새 도메인 추가 시

```
_domains/_새도메인/
├── _hooks/
├── _queryKeys/
├── _services/
└── _types/
```

import 경로: `@/app/_domains/_새도메인/_services/xxx`
