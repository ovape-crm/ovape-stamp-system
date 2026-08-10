# 비바톤 성인 인증 운영 설정

## 구현 범위

- 고객별 24시간 유효 일회성 링크
- 비바톤 OAuth 2.0 성인 여부 확인
- 인증 성공 시 고객 상세의 성인 인증 상태 자동 갱신
- 직원의 실물 신분증 확인 완료 및 인증 해제
- 원본 링크 토큰, 비바톤 액세스 토큰, 이름, 생년월일, 전화번호 미저장

## 적용 순서

1. Supabase SQL Editor에서 `supabase/migrations/20260810000000_adult_verification.sql` 실행
2. 로컬 `.env.local` 및 Vercel 환경변수 등록
3. 운영 재배포

## 필요한 환경변수

```env
SUPABASE_SERVICE_ROLE_KEY=Supabase 프로젝트의 service_role 키
NEXT_PUBLIC_APP_URL=https://ovape-stamp-system-lczx.vercel.app
BBATON_CLIENT_ID=비바톤에서 발급받은 Client ID
BBATON_CLIENT_SECRET=비바톤에서 발급받은 Secret Key
BBATON_REDIRECT_URI=https://ovape-stamp-system-lczx.vercel.app/api/adult-verification/bbaton/callback
```

`SUPABASE_SERVICE_ROLE_KEY`와 `BBATON_CLIENT_SECRET`은 서버 전용 비밀값이다. `NEXT_PUBLIC_` 접두사를 붙이거나 저장소에 커밋하지 않는다.

## 운영 확인

1. 고객 상세에서 `인증 링크 생성` 클릭
2. 복사된 링크를 시크릿 창에서 열기
3. 비바톤 인증 완료
4. 고객 상세를 새로고침하고 `인증 완료 · 비바톤` 표시 확인
5. 같은 링크를 다시 열었을 때 재사용 불가 안내 확인
