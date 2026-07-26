# 초급 개발자를 위한 안전한 Git 작업·배포 가이드

이 문서는 Ovape Stamp System에서 다음 방식으로 작업할 때 사용하는 안내서입니다.

> `main`에서 작업 브랜치 생성 → 코드 변경 → 원격 저장소에 푸시 → Pull Request(PR) 생성 → `main`에 병합 → 자동 배포

이 프로젝트는 `main` 브랜치에 코드가 들어가면 배포가 진행됩니다. 또한 로컬 개발 환경도 운영과 같은 Supabase 데이터베이스를 바라보므로, **코드보다 데이터를 먼저 보호해야 합니다.**

---

## 0. 가장 중요한 안전 수칙

### 로컬 화면도 운영 데이터를 바꾼다

`npm run dev`로 실행한 로컬 사이트에서 등록·수정·삭제를 하면 테스트 데이터베이스가 아니라 **실제 운영 데이터가 변경될 수 있습니다.**

따라서 다음 규칙을 지킵니다.

1. 단순 화면 확인은 조회 기능만 사용합니다.
2. 등록·수정·삭제 테스트가 필요하면 먼저 담당자에게 허락을 받고, 지정된 테스트 계정이나 테스트용 데이터만 사용합니다.
3. 기존 고객, 스탬프, AS, 이력 데이터는 테스트 목적으로 수정하거나 삭제하지 않습니다.
4. SQL, 데이터베이스 스키마 변경, 일괄 수정, 데이터 삭제는 혼자 실행하지 않습니다.
5. `.env.local` 파일과 Supabase 키를 커밋하거나 채팅·문서에 붙여 넣지 않습니다.
6. 브라우저에서 버튼을 누르기 전에 “이 동작이 DB에 쓰기 작업을 하는가?”를 확인합니다.
7. 실수로 운영 데이터를 변경했다면 추가 조작으로 숨기거나 직접 복구하려 하지 말고, 즉시 담당자에게 아래 내용을 알립니다.

   - 발생 시각
   - 작업한 화면
   - 대상 고객이나 데이터
   - 누른 버튼 또는 실행한 명령
   - 변경 전·후 내용을 아는 범위

가장 좋은 장기 대책은 개발용 Supabase 프로젝트를 운영 DB와 분리하는 것입니다. 분리되기 전까지는 이 문서의 보수적인 절차를 따릅니다.

---

## 1. 한 번만 준비하기

PowerShell에서 프로젝트 폴더로 이동합니다.

```powershell
cd C:\Users\DH\Desktop\project
```

필요한 프로그램이 설치되었는지 확인합니다.

```powershell
git --version
node --version
npm --version
```

프로젝트가 요구하는 Node.js 버전은 `.nvmrc`에 적혀 있습니다. 버전 관리자 `nvm`을 사용한다면 다음 명령으로 맞춥니다.

```powershell
nvm use
```

처음 내려받은 저장소이거나 `package-lock.json`이 변경된 경우 의존성을 설치합니다.

```powershell
npm ci
```

`npm ci`는 `package-lock.json`에 기록된 버전을 그대로 설치합니다. 일반적인 프로젝트 설치에는 `npm install`보다 재현성이 좋습니다.

### Git 사용자 정보 확인

```powershell
git config user.name
git config user.email
```

값이 없다면 본인의 이름과 GitHub 이메일을 설정합니다.

```powershell
git config --global user.name "내 이름"
git config --global user.email "내이메일@example.com"
```

---

## 2. Git에서 자주 보는 이름

| 이름 | 의미 |
|---|---|
| `main` | 배포되는 기준 브랜치. 이 프로젝트에서는 직접 작업하지 않습니다. |
| 작업 브랜치 | 내 변경만 담는 브랜치. 예: `feature/customer-search` |
| `origin` | GitHub에 있는 이 프로젝트의 원격 저장소 별명 |
| `origin/main` | 마지막으로 확인한 GitHub의 `main` 상태 |
| commit | 변경사항을 하나의 저장 단위로 기록한 것 |
| push | 로컬 commit을 GitHub로 올리는 것 |
| Pull Request(PR) | 작업 브랜치를 `main`에 합쳐 달라고 검토 요청하는 것 |
| merge | PR의 변경을 `main`에 합치는 것. 이 프로젝트에서는 배포가 시작될 수 있습니다. |

`git add`는 GitHub에 올리는 명령이 아닙니다. 전체 흐름은 다음과 같습니다.

```text
파일 변경 → git add → git commit → git push → PR → merge → 배포
```

---

## 3. 매 작업을 시작할 때

### 3-1. 현재 상태 확인

```powershell
git status
git branch --show-current
```

`git status`에 내가 기억하지 못하는 변경 파일이 보이면 다음 단계로 넘어가지 않습니다. 다른 작업을 덮어쓸 수 있으므로 변경한 사람이나 담당자에게 먼저 확인합니다.

### 3-2. 원격 저장소의 최신 정보 가져오기

```powershell
git fetch origin
```

`fetch`는 GitHub의 최신 정보를 가져오지만 현재 파일을 바꾸지는 않으므로 안전하게 상태를 확인할 수 있습니다.

### 3-3. `main`으로 이동하고 최신화

작업 파일이 없는 깨끗한 상태에서 실행합니다.

```powershell
git switch main
git pull --ff-only origin main
```

`--ff-only`는 예상치 못한 merge commit을 자동으로 만들지 않게 해 줍니다. 명령이 실패하면 억지로 해결하지 말고 `git status` 결과를 확인합니다.

### 3-4. 최신 `main`에서 새 작업 브랜치 만들기

```powershell
git switch -c feature/customer-search
```

브랜치 이름은 작업 내용을 짧은 영문 소문자로 표현합니다.

| 작업 종류 | 예시 |
|---|---|
| 새 기능 | `feature/customer-search` |
| 버그 수정 | `fix/stamp-count-error` |
| 문서 | `docs/development-guide` |
| 코드 정리 | `refactor/customer-service` |

브랜치가 제대로 만들어졌는지 확인합니다.

```powershell
git branch --show-current
```

출력이 `main`이면 코드를 수정하지 말고 작업 브랜치를 다시 만듭니다.

> 한 브랜치에는 한 가지 목적의 작업만 넣습니다. 고객 검색과 AS 화면 수정처럼 서로 다른 작업은 브랜치를 나눕니다.

---

## 4. 코드를 변경하는 동안

### 개발 서버 실행

```powershell
npm run dev
```

터미널에 표시되는 로컬 주소(보통 `http://localhost:3000`)를 브라우저에서 엽니다. 서버를 종료할 때는 실행 중인 터미널에서 `Ctrl+C`를 누릅니다.

### 운영 DB 연결 상태에서 안전하게 확인하기

- 화면 배치, 문구, 조회, 검색, 정렬 등 읽기 위주로 확인합니다.
- 저장, 등록, 차감, 상태 변경, 삭제 버튼은 누르기 전에 실제 운영 데이터 변경 여부를 확인합니다.
- 테스트 데이터가 꼭 필요하다면 담당자가 지정한 데이터만 사용합니다.
- “테스트 후 삭제”도 실제 삭제 작업이므로 임의로 하지 않습니다.
- Supabase 대시보드의 SQL Editor에서 쿼리를 실행하지 않습니다.

### 작업 중 변경 확인

```powershell
git status
git diff
```

- `git status`: 어떤 파일이 변경되었는지 확인
- `git diff`: 아직 commit하지 않은 실제 코드 차이 확인

작업 도중에도 자주 확인하면 의도하지 않은 파일이나 비밀 정보가 섞이는 것을 막을 수 있습니다.

---

## 5. 변경사항 검증하기

현재 프로젝트에는 별도의 자동 테스트 명령이 없습니다. 최소한 아래 두 가지를 모두 실행합니다.

```powershell
npm run lint
npm run build
```

- `npm run lint`: 코드 규칙과 흔한 오류 검사
- `npm run build`: 배포용 빌드가 실제로 성공하는지 검사

둘 중 하나라도 실패하면 commit이나 PR을 서두르지 말고 오류를 수정한 뒤 다시 실행합니다. 경고도 새로 만든 문제라면 가능한 한 해결합니다.

그다음 브라우저에서 다음을 확인합니다.

1. 변경한 화면이 정상적으로 열리는가?
2. 모바일·데스크톱 화면이 깨지지 않는가?
3. 조회와 이동 등 관련 기능이 정상인가?
4. 브라우저 개발자 도구 Console에 새 오류가 없는가?
5. DB 쓰기가 필요한 검증은 사전 허가와 지정된 테스트 데이터로만 했는가?

---

## 6. Commit 만들기

### 6-1. 포함할 파일 다시 확인

```powershell
git status
git diff
```

`.env.local`, 비밀번호, API 키, 고객 개인정보, 디버그용 임시 파일이 보이면 commit에 포함하지 않습니다.

### 6-2. 파일을 선택해서 stage하기

가능하면 `git add .` 대신 파일을 명시합니다.

```powershell
git add src/app/변경한파일.tsx
git add docs/변경한문서.md
```

stage된 내용만 확인합니다.

```powershell
git diff --staged
```

잘못 stage한 파일은 파일 내용은 유지한 채 stage에서만 뺄 수 있습니다.

```powershell
git restore --staged src/app/잘못추가한파일.tsx
```

### 6-3. Commit 기록

```powershell
git commit -m "feat: 고객 검색 기능 추가"
```

자주 쓰는 commit 접두어:

| 접두어 | 용도 | 예시 |
|---|---|---|
| `feat` | 기능 추가 | `feat: 고객명 검색 추가` |
| `fix` | 버그 수정 | `fix: 스탬프 개수 계산 오류 수정` |
| `docs` | 문서 변경 | `docs: 개발 작업 절차 추가` |
| `refactor` | 동작을 유지한 코드 정리 | `refactor: 고객 조회 로직 분리` |
| `style` | 코드 의미와 무관한 형식 수정 | `style: 버튼 간격 조정` |
| `chore` | 설정·도구 등 기타 작업 | `chore: lint 설정 정리` |

좋은 메시지는 “무엇을 바꿨는지” 한눈에 알 수 있습니다. `수정`, `작업함`, `최종`처럼 의미가 모호한 메시지는 피합니다.

commit 후 확인합니다.

```powershell
git status
git log -1 --oneline
```

추가 수정이 생기면 다시 검증하고 `add`와 `commit`을 반복해도 됩니다.

---

## 7. GitHub에 Push하기

처음 한 번은 현재 브랜치와 원격 브랜치를 연결합니다.

```powershell
git push -u origin feature/customer-search
```

이후 같은 브랜치에서 추가 commit을 올릴 때는 짧게 실행할 수 있습니다.

```powershell
git push
```

`feature/customer-search` 부분은 반드시 현재 브랜치 이름으로 바꿉니다. 확인 명령:

```powershell
git branch --show-current
```

### Push와 배포의 관계

- 작업 브랜치에 push: 보통 배포용 `main`은 변하지 않으므로 운영 배포가 시작되지 않습니다.
- PR을 `main`에 merge: `main`이 변경되므로 운영 배포가 시작됩니다.
- 따라서 **push보다 merge가 배포 관점에서 더 중요한 최종 행동**입니다.

`git push --force` 또는 `git push -f`는 다른 사람의 이력을 지울 수 있으므로 사용하지 않습니다.

---

## 8. Pull Request 만들기

GitHub 저장소로 이동하면 방금 push한 브랜치의 `Compare & pull request` 버튼이 표시될 수 있습니다.

PR 생성 화면에서 다음을 확인합니다.

1. **base**가 `main`인지 확인합니다.
2. **compare**가 내 작업 브랜치인지 확인합니다.
3. 제목은 변경 내용을 분명하게 적습니다.
4. 본문에 변경 내용과 검증 결과를 적습니다.
5. 운영 DB에 영향을 주는 변경인지 명시합니다.
6. 바로 배포하면 안 되면 Draft PR로 생성합니다.

PR 본문 예시:

```markdown
## 변경 내용
- 고객 목록에 이름 검색 기능 추가
- 검색 결과가 없을 때 안내 문구 표시

## 검증
- [x] npm run lint
- [x] npm run build
- [x] 로컬에서 조회 기능 확인

## 데이터베이스 영향
- 스키마 변경 없음
- 데이터 생성·수정·삭제 없음

## 배포 후 확인
- 고객 목록 검색 동작 확인
```

다음 변경은 PR 제목과 본문에서 특별히 강조하고 담당자 승인을 받습니다.

- Supabase 쿼리 또는 서비스 코드 변경
- 데이터 생성·수정·삭제 동작 변경
- 권한, 로그인, 환경 변수 변경
- DB 스키마나 SQL 변경
- 고객·스탬프·AS·결제 데이터에 영향을 주는 변경

리뷰에서 수정 요청을 받으면 같은 작업 브랜치에서 수정합니다.

```powershell
git add 변경한파일
git commit -m "fix: PR 리뷰 내용 반영"
git push
```

기존 PR에 새 commit이 자동으로 추가됩니다. PR을 새로 만들 필요는 없습니다.

---

## 9. Merge 전 최종 확인과 배포

`main` merge는 곧 배포 시작으로 이어질 수 있습니다. Merge 버튼을 누르기 전에 다음을 확인합니다.

- [ ] PR의 base가 `main`이다.
- [ ] 리뷰 승인을 받았다.
- [ ] 자동 검사와 `npm run lint`, `npm run build`가 성공했다.
- [ ] 원하지 않는 파일과 비밀 정보가 없다.
- [ ] DB 영향과 위험이 PR에 적혀 있다.
- [ ] DB 변경이 있다면 담당자가 실행 순서와 복구 방법을 승인했다.
- [ ] 지금 배포해도 되는 시간인지 확인했다.
- [ ] 배포 후 확인할 화면과 기능을 알고 있다.

초급자는 가능하면 직접 merge하지 않고 담당자 또는 리뷰어가 merge하도록 요청합니다. 특히 DB 관련 변경은 코드와 DB의 적용 순서가 어긋나면 장애가 날 수 있으므로 단독으로 진행하지 않습니다.

Merge 후에는 Vercel에서 배포 상태가 성공인지 확인하고, 운영 사이트에서 **조회 중심의 간단한 확인**을 합니다. 오류가 보이면 추가 데이터를 수정하지 말고 즉시 담당자에게 알립니다.

---

## 10. 작업이 끝난 뒤 정리

PR이 merge된 것을 확인한 뒤 로컬 `main`을 최신화합니다.

```powershell
git switch main
git pull --ff-only origin main
```

merge가 완료된 로컬 작업 브랜치는 삭제할 수 있습니다.

```powershell
git branch -d feature/customer-search
```

원격 브랜치 삭제는 팀 규칙 또는 GitHub의 PR 화면에서 처리합니다. `-D`는 merge되지 않은 브랜치도 강제로 지우므로 사용하지 않습니다.

다음 작업은 다시 최신 `main`에서 새 브랜치를 만들어 시작합니다.

```powershell
git switch -c feature/다음-작업
```

---

## 11. 작업 중 `main`이 변경된 경우

PR을 만들었는데 다른 사람의 PR이 먼저 merge되면 내 브랜치가 최신 `main`보다 뒤처질 수 있습니다.

먼저 작업 내용을 모두 commit하고 상태가 깨끗한지 확인합니다.

```powershell
git status
git fetch origin
git merge origin/main
```

충돌이 없다면 검증 후 push합니다.

```powershell
npm run lint
npm run build
git push
```

충돌이 발생하면 파일 안에 아래 표시가 생길 수 있습니다.

```text
<<<<<<< HEAD
내 브랜치의 코드
=======
main의 코드
>>>>>>> origin/main
```

충돌은 어느 코드를 남길지 판단해야 하는 작업입니다. 잘 모르는 상태에서 표시만 지우지 말고 담당자와 함께 해결합니다. 해결 후에는 다음 순서로 진행합니다.

```powershell
git add 충돌을해결한파일
git commit
npm run lint
npm run build
git push
```

이 가이드에서는 이미 공유한 브랜치의 이력을 안전하게 유지하기 위해 `rebase`보다 `merge origin/main`을 사용합니다.

---

## 12. 자주 생기는 상황과 안전한 대응

### `main`에서 실수로 파일을 수정했지만 아직 commit하지 않은 경우

수정 내용을 버리지 말고 새 브랜치를 바로 만듭니다.

```powershell
git switch -c fix/작업이름
```

대부분의 경우 현재 변경사항을 가진 채 새 브랜치로 이동합니다. 이후 정상적으로 검증, add, commit합니다.

### `main`에서 실수로 commit한 경우

push하지 말고 더 이상 명령을 실행하지 않습니다. commit을 작업 브랜치로 옮기고 `main`을 복구하는 과정에는 이력 변경이 포함되므로 담당자에게 `git status`와 `git log -3 --oneline` 결과를 보여 주고 함께 처리합니다.

### 변경사항을 잠시 보관하고 다른 브랜치로 가야 하는 경우

초급자에게는 `stash`보다 현재 작업을 안전하게 commit한 뒤 이동하는 방식을 권장합니다. 불완전한 작업임을 표시할 수 있습니다.

```powershell
git add 변경한파일
git commit -m "wip: 고객 검색 작업 임시 저장"
```

`wip` commit은 PR을 merge하기 전에 정리 여부를 리뷰어와 상의합니다.

### Push가 거절된 경우

`--force`로 해결하지 않습니다.

```powershell
git status
git fetch origin
```

출력 내용을 담당자에게 공유합니다. 같은 원격 브랜치를 다른 사람이 수정했을 가능성이 있습니다.

### 잘못된 파일을 commit했지만 아직 push하지 않은 경우

혼자 `reset`, `amend`를 실행하기보다 담당자와 먼저 확인합니다. 이미 push했다면 기존 이력을 강제로 고치지 말고, 비밀 정보 포함 여부를 즉시 알립니다. 비밀 키가 포함됐다면 파일을 지우는 commit만으로는 충분하지 않으며 키 폐기·재발급이 필요합니다.

### 개발 서버가 실행되지 않는 경우

다음 순서로 확인합니다.

```powershell
node --version
npm ci
npm run dev
```

`.env.local`이 필요한 프로젝트이지만, 다른 사람의 키를 채팅으로 받거나 저장소에 올리지 않습니다. 팀에서 정한 안전한 방식으로 전달받습니다.

---

## 13. 절대 임의로 실행하지 않을 명령

아래 명령은 변경을 잃거나 다른 사람의 작업을 덮어쓸 수 있습니다. 정확한 의미와 복구 방법을 아는 담당자와 함께할 때만 사용합니다.

```text
git push --force
git push -f
git reset --hard
git clean -fd
git branch -D ...
git rebase ...
```

또한 운영 DB에서 아래 작업을 임의로 하지 않습니다.

```text
DROP / TRUNCATE / DELETE / UPDATE
스키마 변경
마이그레이션 실행
대량 데이터 수정
RLS·권한 정책 변경
```

---

## 14. 매일 사용할 수 있는 전체 명령 요약

아래 예시에서 `feature/customer-search`와 파일 이름은 내 작업에 맞게 바꿉니다.

```powershell
# 1. 프로젝트로 이동
cd C:\Users\DH\Desktop\project

# 2. 작업 전 상태 확인
git status
git branch --show-current

# 3. 최신 main 준비
git fetch origin
git switch main
git pull --ff-only origin main

# 4. 작업 브랜치 생성
git switch -c feature/customer-search

# 5. 개발
npm run dev

# 6. 변경과 품질 확인
git status
git diff
npm run lint
npm run build

# 7. commit
git add src/app/변경한파일.tsx
git diff --staged
git commit -m "feat: 고객 검색 기능 추가"

# 8. 원격에 push
git push -u origin feature/customer-search

# 9. GitHub에서 main 대상 PR 생성
# 10. 리뷰 승인과 최종 점검 후 merge → 자동 배포

# 11. merge 후 로컬 정리
git switch main
git pull --ff-only origin main
git branch -d feature/customer-search
```

---

## 15. 시작 전·PR 전 체크리스트

### 작업 시작 전

- [ ] `git status`가 깨끗하다.
- [ ] 최신 `main`을 받았다.
- [ ] `main`이 아닌 새 작업 브랜치에 있다.
- [ ] 작업 범위가 한 가지로 명확하다.
- [ ] DB 쓰기 테스트가 필요한지 미리 판단했다.

### PR 생성 전

- [ ] `git diff`와 `git diff --staged`를 직접 확인했다.
- [ ] `.env.local`, 키, 개인정보가 포함되지 않았다.
- [ ] `npm run lint`가 성공했다.
- [ ] `npm run build`가 성공했다.
- [ ] 허가 없이 운영 데이터를 변경하지 않았다.
- [ ] PR에 DB 영향과 배포 후 확인 항목을 적었다.

### Merge 전

- [ ] 리뷰 승인을 받았다.
- [ ] 배포 가능한 시점이다.
- [ ] DB 변경 순서와 복구 계획이 승인되었다.
- [ ] 배포 상태를 확인할 사람이 있다.

모르는 오류가 생겼을 때 가장 안전한 행동은 명령을 더 실행하는 것이 아니라 현재 상태를 보존하는 것입니다. `git status`, `git branch --show-current`, `git log -3 --oneline` 결과와 오류 메시지를 담당자에게 공유하면 대부분 안전하게 이어서 해결할 수 있습니다.
