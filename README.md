# Ovape Stamp System

**Ovape Stamp System**은 고객 스탬프 정보 및 AS(After-Service) 이력을 통합 관리하는 CRM 웹 애플리케이션입니다.
관리자는 고객 목록과 스탬프 현황을 실시간으로 파악하고, AS 접수부터 완료까지 전 과정을 추적할 수 있습니다.

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | Ovape Stamp System |
| **목적** | 고객 스탬프 관리 및 AS 이력 통합 조회 시스템 |
| **DB** | Supabase (PostgreSQL) |
| **배포 플랫폼** | Vercel |
| **프레임워크** | Next.js 15 (App Router) |
| **상태 관리 및 폼** | React Hook Form + Zod |
| **개발 언어** | TypeScript 5 |
| **스타일링** | Tailwind CSS 4 |

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| **Frontend Framework** | [Next.js 15](https://nextjs.org/) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **UI Framework** | [React 19](https://react.dev/) + [Tailwind CSS 4](https://tailwindcss.com/) |
| **Form Handling** | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| **Backend (DB)** | [Supabase](https://supabase.io/) |
| **Notifications** | [React Hot Toast](https://react-hot-toast.com/) |
| **Hosting / CI-CD** | [Vercel](https://vercel.com/) |
| **Linting** | ESLint + eslint-config-next |

---

## 주요 기능

### 고객 관리 (`/customers`)
- 고객 등록, 수정, 삭제 (삭제는 관리자 전용)
- 이름 / 전화번호 검색 및 정렬 (이름, 스탬프 수, 등록일)
- 고객 상세 페이지에서 스탬프 현황 및 활동 이력 조회
- 고객별 메모(비고) 등록 및 이력 추적

### 스탬프 관리
- 고객별 스탬프 적립 (결제 수단 기록: 카드, 이체, 현금, 현금영수증 등)
- 스탬프 차감 (쿠폰 사용 / 환불 모드)
- 스탬프 거래 이력 조회

### AS(After-Service) 관리 (`/after-services`)
- AS 접수 생성 및 수정
- 제품 유형 분류: 기기, 일회용 기기, 리퀴드, 소모품
- AS 진행 상태 추적 (총 13가지 상태):
  - **접수:** 접수
  - **진행 중:** 교환, 대여, 수리 접수, 수리 입고, 기타 (진행 중)
  - **완료:** 수리 입고 (재고 처리), AS 불가, 고객 수령, 반품 처리, 기타 (완료)
- 대여 기기 지급 여부 관리
- 고객용 / 매장용 메모 분리 입력
- AS 상세 정보 드로어(Drawer) UI

### 이력 조회 (`/histories`)
- 스탬프 거래 이력 (결제 수단 포함)
- 고객 등록 및 수정 이력
- 비고 변경 이력
- 날짜 범위 필터링

### 인증 및 권한
- Supabase Auth 기반 이메일/비밀번호 로그인
- 역할 구분: `staff` / `admin`
- 관리자 전용 기능 (삭제 등) 조건부 노출

---

## 프로젝트 구조

```
src/
├── app/
│   ├── (auth)/                     # 인증 필요 라우트
│   │   ├── _components/            # 공통 컴포넌트 (Header 등)
│   │   ├── customers/              # 고객 관리
│   │   │   ├── page.tsx            # 고객 목록
│   │   │   └── [id]/               # 고객 상세
│   │   ├── after-services/         # AS 관리
│   │   │   └── page.tsx            # AS 목록
│   │   ├── histories/              # 이력 조회
│   │   │   └── page.tsx
│   │   └── layout.tsx              # 인증 레이아웃 (UserProvider)
│   ├── (public)/                   # 비인증 라우트
│   │   └── login/                  # 로그인 페이지
│   ├── _components/                # 공용 UI 컴포넌트
│   │   ├── Button/
│   │   ├── Drawer/
│   │   ├── Dropdown/
│   │   ├── DateRangePicker/
│   │   └── Loading/
│   ├── _contexts/                  # React Context
│   │   ├── UserContext.tsx          # 인증 사용자 상태
│   │   └── ModalContext.tsx         # 전역 모달 관리
│   ├── _enums/                     # Enum 상수 정의
│   ├── _hooks/                     # 커스텀 훅
│   ├── _services/                  # Supabase 서비스 레이어
│   │   ├── customerService.ts
│   │   ├── stampService.ts
│   │   ├── afterService.ts
│   │   └── logService.ts
│   ├── _types/                     # TypeScript 타입 정의
│   └── _utils/                     # 유틸리티 함수
├── libs/                           # 라이브러리 초기화
```

---

## 서비스 레이어

모든 Supabase 연동은 `src/app/_services/` 하위 서비스 파일에서 처리합니다.

| 파일 | 주요 함수 |
|------|-----------|
| `customerService.ts` | `getCustomers`, `createCustomer`, `updateCustomer`, `deleteCustomer` |
| `stampService.ts` | `addStamp`, `removeStamp`, `getStampsByCustomer` |
| `afterService.ts` | `createAfterService`, `getAfterServices`, `updateAfterServiceStatus` |
| `logService.ts` | `createLog`, `getLogs`, `getLogsByCustomer`, `getLogsByAfterServiceId` |

---

## 데이터 흐름

```
Component → Custom Hook (useXxx) → Service (getXxx/createXxx) → Supabase → State 업데이트
```

- 모든 CUD(생성/수정/삭제) 작업 시 **감사 로그(Log)** 자동 생성
- 수정 전/후 값을 `jsonb` 필드에 저장하여 변경 이력 추적

---

## 커스텀 훅

| 훅 | 역할 |
|----|------|
| `useCustomers()` | 고객 목록 (검색/정렬/페이지네이션) |
| `useCustomer()` | 고객 단건 조회 |
| `useAfterServices()` | AS 목록 (필터/페이지네이션) |
| `useAfterService()` | AS 단건 조회 |
| `useLogs()` | 전체 이력 (날짜 범위 필터) |
| `useLogsByCustomerId()` | 고객별 이력 |
| `useLogsByAfterServiceId()` | AS별 이력 |
| `useCopy()` | 클립보드 복사 |
