지금까지 만든 구조를 테이블 + 인덱스 기준으로 텍스트 정리해줄게.
(현재 네가 사용한 이름 기준)

⸻

1. 테이블 구조

1️⃣ comparision_columns

기기 비교에 사용할 컬럼 정의 테이블

사용자가 비교 컬럼을 추가 / 수정 / 삭제 / 순서 변경할 수 있음.

컬럼

컬럼 타입 설명
id uuid PK 컬럼 식별자
name text 컬럼 이름 (예: 기기명, 저항값, 배터리)
key text 내부 식별용 key
sort_order integer 컬럼 표시 순서
is_active boolean 삭제 대신 비활성화 처리
created_at timestamptz 생성 시간
updated_at timestamptz 수정 시간

역할

예시

id name sort_order
1 기기명 1
2 저항값 2
3 배터리 3

⸻

2️⃣ comparision_devices

실제 기기 정보

기기 하나가 하나의 row.

컬럼

컬럼 타입 설명
id uuid PK 기기 ID
created_at timestamptz 생성 시간
updated_at timestamptz 수정 시간

역할

예시

id
device_1
device_2
device_3

⸻

3️⃣ comparision_device_values

기기별 컬럼 값을 저장하는 테이블

기기 하나에 대해 컬럼 수 만큼 row가 생김

컬럼

컬럼 타입 설명
id uuid PK 값 row 식별자
device_id uuid FK 기기 id
column_id uuid FK 컬럼 id
value text 컬럼 값
created_at timestamptz 생성 시간
updated_at timestamptz 수정 시간

관계

comparision_devices
│
│ device_id
▼
comparision_device_values
▲
│ column_id
comparision_columns

예시 데이터

device_id column_id value
device1 기기명 Geekvape X
device1 저항값 0.6옴
device1 배터리 2500mAh
device2 기기명 Voopoo Drag
device2 저항값 0.4옴
device2 배터리 3000mAh

⸻

2. 인덱스 구조

1️⃣ column_id 인덱스

create index idx_comparision_device_values_column_id
on comparision_device_values(column_id);

목적

특정 컬럼 기준으로 검색할 때 성능 개선

예시

where column_id = 'battery-column-id'

사용 상황
• 컬럼 기준 검색
• 필터링

⸻

2️⃣ device_id 인덱스

create index idx_comparision_device_values_device_id
on comparision_device_values(device_id);

목적

특정 기기의 값들을 빠르게 조회

예시

where device_id in ('device1','device2')

사용 상황
• 기기 비교
• 기기 상세 조회

⸻

3️⃣ pg_trgm 확장

create extension if not exists pg_trgm;

목적

문자열 부분 검색 성능 개선

예시

value ilike '%2500%'

⸻

4️⃣ value trigram 인덱스

create index idx_comparision_device_values_value_trgm
on comparision_device_values
using gin (value gin_trgm_ops);

목적

value 컬럼의 문자열 검색 성능 개선

예시

where value ilike '%2500%'

또는

where value ilike '%battery%'

⸻

3. 기능별 데이터 흐름

컬럼 설정

사용자가 컬럼 생성

comparision_columns

예

기기명
저항값
배터리

⸻

기기 생성

comparision_devices

예

device1
device2

⸻

기기 값 입력

comparision_device_values

예

device1 / 기기명 / Geekvape
device1 / 배터리 / 2500mAh

⸻

기기 비교

사용자가 여러 기기 선택

device1
device2
device3

조회

comparision_device_values

⸻

값 검색

사용자가

검색 컬럼 : 배터리
검색어 : 2500

조회

where column_id = battery_id
and value ilike '%2500%'

⸻

4. 전체 구조 요약

테이블

comparision_columns
comparision_devices
comparision_device_values

관계

devices 1:N device_values
columns 1:N device_values

인덱스

idx_comparision_device_values_column_id
idx_comparision_device_values_device_id
idx_comparision_device_values_value_trgm

확장

pg_trgm

⸻

한 줄 정리

이 구조는 **동적 컬럼 기반 비교 시스템(EAV 구조)**이며
• 컬럼은 comparision_columns
• 기기는 comparision_devices
• 값은 comparision_device_values

에 저장되고
검색과 비교 성능을 위해 3개의 인덱스 + trigram 확장을 사용하고 있음.

⸻

원하면 다음 단계로 **프론트에서 비교 테이블 만들기 쉬운 SQL (pivot 형태)**도 만들어줄게.
이거 실제 서비스에서 꽤 중요해.
