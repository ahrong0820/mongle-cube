# 몽글큐브 다중 가구 확장 명세서

## 1. 목적

현재 몽글큐브는 하나의 가구가 여러 기기에서 같은 냉동실 데이터를 공유하는 구조다. 이를 한 개의 사이트에서 여러 가족이 각자 독립된 냉동실을 사용할 수 있도록 확장한다.

이 확장의 핵심 목표는 다음과 같다.

- 하나의 GitHub Pages 사이트를 여러 가족이 함께 사용한다.
- 가족별 큐브, 식단, 먹은 기록, 반응, 재료, 레시피, 폐기 기록, 아기 프로필은 완전히 분리한다.
- 각 가족은 최대 10대의 브라우저·휴대폰·태블릿을 연결할 수 있다.
- 각 가구는 아이 이름과 사람이 읽기 쉬운 가구 표시명을 가진다.
- 메인 화면에서 현재 연결된 가족 냉동실의 정체성을 자연스럽게 확인할 수 있어야 한다.
- 운영자는 아이 이름/가구 이름으로 여러 household를 쉽게 구분할 수 있어야 한다.
- 현재 사용 중인 기존 household와 데이터는 그대로 유지한다.
- 기존의 익명 기기 인증과 초대 링크 방식은 최대한 유지한다.
- 1차 확장에서는 공개 회원가입이나 누구나 새 가구를 만드는 기능을 제공하지 않는다. 운영자가 새 가구를 만들고 초대 링크를 전달한다.

## 2. 용어

### 가구(Household)

한 가족의 완전히 독립된 데이터 영역이다. 각 가구는 고유한 `household_id`를 가진다.

### 아이 이름(Baby name)

아이 자체의 이름이다. DB 컬럼은 `households.baby_name`을 사용한다.

예: `지안`

아이 이름은 `지안이네` 같은 가구 이름에서 역으로 파싱하지 않는다. 향후 `지안이 이유식 30일차`, `지안이의 NEW 재료`처럼 아이 이름 자체가 필요한 화면에서 사용할 수 있도록 별도 데이터로 저장한다.

### 가구 표시명(Display name)

사람이 가구를 식별하기 위한 이름이다. DB의 기존 `households.display_name`을 계속 사용한다.

예: `지안이네`

`baby_name`과 `display_name`은 서로 다른 필드다. 표시명은 아이 이름을 기반으로 제안할 수 있지만 독립적으로 수정 가능해야 한다.

### 연결 기기(Member)

한 개의 Supabase anonymous user 세션을 한 개의 연결 기기로 간주한다. 실제 물리 기기보다 정확히는 브라우저 프로필 단위다.

예:

- 같은 사람이 휴대폰 Safari + 태블릿 Safari를 사용하면 2대다.
- 같은 휴대폰에서 일반 Safari와 별도 브라우저를 사용하면 각각 별도 연결로 계산될 수 있다.
- 브라우저 저장 데이터를 삭제하면 기존 anonymous user 세션을 잃기 때문에 새 연결로 취급한다.

### 초대(Invite)

특정 가구에 새 기기를 연결하기 위한 24시간 유효 토큰이다. 토큰은 원문을 DB에 저장하지 않고 해시로 저장한다.

### 운영자(Operator)

몽글큐브 서비스를 관리하는 사람이다. 1차 확장에서는 Supabase SQL Editor를 통해 새 가구 생성, 초대 재발급, 기기 교체를 처리한다.

## 3. 제품 원칙

### 3.1 한 사이트, 여러 독립 가구

모든 사용자는 동일한 몽글큐브 주소를 사용한다. 그러나 로그인된 anonymous user가 속한 `household_id`에 따라 조회 가능한 데이터가 완전히 달라야 한다.

가구 A의 사용자는 가구 B의 존재 여부, 아이 이름, 아기 날짜, 큐브, 식단, 먹은 기록, 재료, 레시피, 폐기 기록을 조회하거나 수정할 수 없어야 한다.

### 3.2 한 브라우저는 한 가구에만 속한다

현재 `household_members.user_id`의 고유성은 유지한다.

한 anonymous user가 동시에 두 가구에 속하는 기능은 제공하지 않는다. 이미 가구 A에 연결된 브라우저에서 가구 B 초대 링크를 열면 명확한 오류를 표시한다.

> 이미 다른 가족 냉동실에 연결된 브라우저예요.

### 3.3 가족당 최대 10대

- 신규 가구 기본 `member_limit`: 10
- 허용 범위: 1~10
- 기존 가구도 migration 시 10대로 상향한다.
- 10번째 연결이 성공하면 해당 초대는 자동 마감한다.
- 11번째 연결은 반드시 거부한다.
- 동시에 여러 기기가 마지막 자리를 요청해도 10대를 초과하면 안 된다.

### 3.4 아이 이름과 가구 이름은 분리한다

아이 이름은 도메인 데이터이고 가구 표시명은 UI/운영 식별값이다.

금지:

- `display_name`에서 `이네`, `네` 등을 잘라 `baby_name`을 추론
- 아이 이름으로부터 DB가 한국어 조사/호칭을 자동 생성하는 로직
- 실제 아이 이름을 공개 GitHub migration 파일에 하드코딩

권장:

- 신규 가구 생성 시 `baby_name`과 `display_name`을 명시적으로 받는다.
- 향후 관리 UI에서는 `baby_name` 입력 후 `display_name`을 자동 제안하되 사용자가 수정할 수 있게 한다.
- 1차 SQL 운영 단계에서는 운영자가 두 값을 직접 입력한다.

## 4. 사용자 흐름

### 4.1 기존 가구 사용

다중 가구 migration 이후에도 현재 사용 흐름은 바뀌지 않는다.

- 기존 `household_id` 유지
- 기존 `household_members` 유지
- 기존 큐브·먹은 기록·식단·재료·레시피·폐기·아기 날짜 데이터 유지
- 기존 연결 기기는 재연결 불필요
- 기기 한도만 10대로 상향
- 기존 가구의 실제 `baby_name`과 `display_name`은 production 적용 시 운영자가 별도로 설정한다.

실제 아이 이름은 공개 저장소의 migration에 넣지 않는다.

### 4.2 새 지인 가족 생성

예를 들어 아이 이름이 `지안`, 가구 표시명이 `지안이네`인 경우:

1. 운영자가 새 household 생성 함수를 호출하며 `지안`, `지안이네`를 입력한다.
2. 시스템은 `household_id`, `baby_name`, `display_name`, `invite_token`, `expires_at`, `member_limit`을 반환한다.
3. 운영자가 초대 링크를 전달한다.

```text
https://<site>/#invite=<64자리 토큰>
```

4. 첫 번째 기기가 링크를 연다.
5. 앱이 anonymous session을 만들고 초대를 claim한다.
6. 해당 기기는 해당 household의 첫 번째 member가 된다.
7. claim 완료 후 URL fragment의 token을 제거한다.
8. 이후 일반 몽글큐브 주소로 접속한다.
9. 같은 가족의 추가 기기도 같은 활성 초대 링크를 사용해 최대 10대까지 연결한다.

### 4.3 초대 마감

초대는 아래 조건 중 하나가 되면 사용할 수 없어야 한다.

- 만료 시각 경과
- `member_limit` 도달
- 운영자가 수동으로 마감
- 새 토큰으로 rotate되어 기존 토큰 폐기

### 4.4 기기 교체

기존 휴대폰을 교체하거나 브라우저 데이터를 삭제한 경우:

1. 운영자가 가구 표시명으로 대상 household를 찾는다.
2. 기존 `household_members.user_id` 중 교체 대상을 제거한다.
3. 새 초대 토큰을 발급한다.
4. 새 기기에서 해당 초대 링크를 연다.
5. 가구 데이터와 아이 프로필은 그대로 유지한다.

## 5. DB 변경 명세

새 migration만 추가하며 기존 migration 파일은 수정하지 않는다.

### 5.1 `households` 단일 가구 제한 해제

현재 `singleton` 고유 제약 때문에 두 번째 가구를 만들 수 없다.

- `households_singleton_key` 제거
- 기존 `singleton` 컬럼은 1차에서는 deprecated 상태로 남겨도 됨
- 후속 정리 migration에서 필요 시 제거

### 5.2 `member_limit` 10대 상향

현재 허용 범위 `1~5`를 `1~10`으로 변경한다.

- 기본값: 10
- check constraint: `member_limit between 1 and 10`
- 기존 household: `member_limit = 10`

### 5.3 `baby_name` 추가

`public.households`에 아이 이름을 추가한다.

권장 컬럼:

```sql
baby_name text
```

검증 규칙:

- 신규 가구에서는 필수
- `btrim(baby_name)` 길이 1~20자
- 화면 표시 시 trim된 값 사용
- 빈 문자열 금지

기존 production household 때문에 migration의 첫 단계에서는 nullable하게 추가할 수 있다. 이후 production에서 실제 이름을 운영자 설정으로 입력하고 검증이 끝난 뒤 NOT NULL 전환 여부를 별도 migration으로 결정한다.

중요:

- 실제 기존 가족의 아이 이름을 공개 GitHub migration에 하드코딩하지 않는다.
- 신규 `private.create_household_invite`는 `baby_name`을 필수 인자로 받아 새 가구가 이름 없이 생성되지 않게 한다.

### 5.4 `display_name` 역할 확정

기존 `households.display_name`은 가구의 사람이 읽기 쉬운 식별자로 사용한다.

검증:

- 1~40자
- trim 적용
- 신규 가구에서 필수

`display_name`은 전역 unique일 필요가 없다. 서로 다른 가족이 우연히 같은 표시명을 사용할 수 있기 때문이다. 운영 조회 시에는 `display_name + household_id 일부 + created_at` 등으로 구분한다.

### 5.5 가구 생성 함수

운영자 전용 private 함수:

```sql
private.create_household_invite(
  p_baby_name text,
  p_display_name text,
  p_member_limit smallint default 10
)
```

반환:

- `household_id`
- `baby_name`
- `display_name`
- `invite_token`
- `expires_at`
- `member_limit`

동작:

1. baby name trim/길이 검증
2. display name trim/길이 검증
3. member limit 1~10 검증
4. 새 household 생성
5. 암호학적으로 안전한 64자리 hex token 생성
6. DB에는 token hash만 저장
7. 24시간 후 만료 invite 생성
8. 원문 token은 함수 반환값으로 한 번만 제공

`private` schema 함수는 클라이언트의 `anon`/`authenticated` role에 grant하지 않는다.

### 5.6 초대 claim

현재 `public.claim_household_invite(p_token)` 구조를 유지하되 다중 가구 기준으로 재검증한다.

필수 규칙:

- 인증된 anonymous user만 가능
- token 형식 검증
- token hash로 정확한 household 탐색
- 만료 초대 거부
- 비활성 초대 거부
- 이미 같은 household 멤버면 idempotent success
- 다른 household 멤버면 거부
- 현재 member 수를 transaction 안에서 확인
- member limit 이상이면 거부
- 마지막 자리 연결 시 invite 자동 비활성화
- 동시 claim에서도 member limit 초과 금지

claim 이후 프론트가 household profile을 읽으면 `baby_name`과 `display_name`도 함께 얻을 수 있어야 한다.

### 5.7 초대 rotate / close

```sql
private.rotate_household_invite(
  p_household_id uuid,
  p_remove_user_id uuid default null
)
```

- 필요 시 기존 member 1명 제거
- 기존 초대 폐기
- 새 24시간 token 발급
- 가구 데이터/아이 프로필은 건드리지 않음

```sql
private.close_household_invite(p_household_id uuid)
```

- 해당 가구의 현재 invite 즉시 비활성화

### 5.8 초대 테이블

1차 확장에서는 현재처럼 한 가구당 활성 초대 1개 모델을 유지한다.

`household_invites.household_id`가 PK인 현재 구조를 유지한다.

## 6. 데이터 격리 및 RLS 명세

다중 가구 확장의 가장 중요한 acceptance criterion은 가구 간 데이터 누출이 0이어야 한다는 것이다.

분리 대상:

- `households` (`baby_name`, `display_name`, 아기 날짜 포함)
- `household_members`
- `cube_batches`
- `meal_plan_items`
- `consumption_records`
- `ingredients`
- `cube_recipes`
- `cube_recipe_ingredients`
- `cube_batch_ingredients`
- `consumption_record_ingredients`
- `cube_disposals`

각 테이블의 RLS는 `private.is_household_member(household_id)` 또는 동등한 멤버십 검사만으로 접근을 허용한다.

### 6.1 Cross-household 금지

가구 A user가 가구 B의 ID를 알아도 아래가 모두 실패해야 한다.

- household profile 및 `baby_name`/`display_name` SELECT
- INSERT / UPDATE
- cube delete/consume RPC
- meal plan RPC
- consumption RPC
- disposal RPC
- ingredient/recipe RPC
- realtime event 수신

### 6.2 복합 FK 유지

현재 사용 중인 `(id, household_id)` 복합 foreign key 패턴을 유지한다.

가구 A의 batch에 가구 B의 ingredient를 연결하거나 가구 A의 record가 가구 B의 meal plan을 참조할 수 없어야 한다.

## 7. 인증 및 보안 정책

### 7.1 클라이언트 키

클라이언트에는 기존 Supabase publishable key만 사용한다.

절대 웹에 포함하지 않는다:

- service role key
- database password
- private 운영자 token

### 7.2 익명 인증

1차 지인 베타에서는 anonymous sign-in을 유지한다.

초대가 없는 anonymous user는 어떤 household 데이터에도 접근할 수 없어야 한다.

### 7.3 초대 링크

- 64자리 random hex
- DB에는 hash만 저장
- 기본 유효기간 24시간
- claim 후 URL fragment 즉시 제거
- rotate 시 이전 token 즉시 무효화

### 7.4 아이 이름 개인정보 처리

아이 이름은 가구 내부 사용자에게만 노출되는 profile 데이터로 취급한다.

- 공개 저장소의 migration/test fixture에는 실제 production 아이 이름을 넣지 않는다.
- 자동 테스트는 `아기A`, `아기B`, `지안` 등 임의 fixture만 사용한다.
- 운영자 SQL 결과나 로그를 외부에 공유할 때 실제 이름/household ID를 함께 노출하지 않는다.

## 8. 프론트엔드 명세

### 8.1 Repository / profile 모델

기존 `BabyProfile` 또는 household profile 모델을 확장해 최소 다음 값을 제공한다.

```ts
{
  babyName: string | null
  displayName: string
  birthDate: string | null
  weaningStartedOn: string | null
}
```

현재 household 결정은 항상 `auth.uid()`의 membership을 통해 수행한다. 첫 번째 household나 singleton row를 가정하지 않는다.

### 8.2 메인 화면 개인화

이름은 모든 UI에 반복하지 않는다. 가구 정체성을 확인하는 핵심 위치에만 사용한다.

권장 노출:

1. 상단 브랜드 서브카피
   - 기존: `우리집 이유식 냉동실`
   - 변경: `{displayName} 이유식 냉동실`

2. 초록 냉동실 요약 카드
   - 이름 있음: `{displayName} 냉동실에 모두`
   - 이름 설정 전 fallback: `냉동실에 모두`

예:

```text
몽글큐브
지안이네 이유식 냉동실

지안이네 냉동실에 모두
12개
```

큐브 카드, 식단 개별 행, 달력의 모든 항목에 이름을 반복해서 붙이지 않는다.

### 8.3 아이 이름 활용 원칙

`baby_name`은 향후 다음 기능에 사용할 수 있다.

- `{babyName}이 이유식 N일차`
- `{babyName}이의 NEW 재료`
- 프로필/설정 제목

1차 다중 가구 구현에서는 꼭 필요한 화면 외에는 과도하게 개인화하지 않는다. 문법상 어색한 자동 조사 처리가 필요한 표현은 이번 범위에서 만들지 않는다.

### 8.4 아기 프로필 설정 화면

기존 아기 날짜 설정 화면에 `아이 이름`을 추가한다.

권장:

- 아이 이름 입력 필드
- 가구 이름 입력 필드 또는 별도 설정 영역
- 아이 이름 수정 시 가구 이름을 강제로 변경하지 않음
- 가구 이름은 별도로 수정 가능

기존 production 가구의 초기 이름 세팅도 이 API/RPC와 동일한 validation을 사용해야 한다.

### 8.5 연결되지 않은 브라우저

membership이 없다면 초대 필요 화면을 표시한다.

> 가족 냉동실 연결이 필요해요
>
> 받은 몽글큐브 초대 링크를 이 브라우저에서 한 번 열어 주세요.

### 8.6 초대 오류

구분 가능한 오류:

- 초대 만료
- 초대 마감
- 연결 기기 10대 초과
- 잘못된 token
- 이미 다른 가구에 연결된 브라우저

## 9. 운영 명세

### 9.1 신규 가구 생성

1차 운영 예시:

```sql
select * from private.create_household_invite(
  '지안',
  '지안이네',
  10
);
```

운영자는 반환된 `display_name`을 확인한 뒤 token으로 초대 링크를 만들어 전달한다.

### 9.2 가구 조회

가구가 여러 개가 되면 UUID만으로 운영하지 않는다.

운영 조회 결과에 최소 다음을 포함한다.

- `display_name`
- `baby_name`
- `member_count`
- `member_limit`
- `created_at`
- invite 상태/만료 시각

예시 개념:

```text
가구 표시명 | 아이 이름 | 연결 기기
지안이네   | 지안     | 3 / 10
아기B네    | 아기B    | 2 / 10
```

### 9.3 기존 production 가구 이름 설정

기존 household의 실제 아이 이름과 가구 표시명은 migration 파일이 아니라 production 운영 단계에서 설정한다.

원칙:

- 대상 household를 정확히 확인한 후 household-scoped UPDATE/RPC 사용
- 기존 `household_id` 변경 금지
- 큐브/식단/먹은 기록 등 사용 데이터 변경 없음
- 설정 후 연결된 기존 기기에서 표시명이 정상 노출되는지 확인

### 9.4 향후 관리자 기능 후보

- 가구 목록
- 아이 이름 / 가구 표시명
- 연결 기기 수 / 10
- 초대 생성·재발급·마감
- 마지막 연결 시각
- 오래된 anonymous member 정리

관리자 인증 설계가 확정되기 전에는 public 앱에 운영자 기능을 넣지 않는다.

## 10. Migration 전략

### Phase A — 다중 가구 + 가구 정체성 DB 기반

새 migration으로 처리:

- singleton unique constraint 제거
- member limit 1~10 / default 10
- 기존 household member limit 10으로 상향
- `households.baby_name` 추가
- 다중 가구 생성 private RPC에 baby/display name 입력 추가
- invite rotate/close 다중 가구 검증
- claim concurrency 재검증
- household profile RLS 재검증

이 단계에서는 실제 두 번째 production household를 아직 만들지 않는다.

### Phase B — 격리 자동 테스트

테스트 환경에서 최소 두 household를 만든다.

- household A: `아기A`, `A네`
- household B: `아기B`, `B네`

각 가구에 서로 다른 anonymous user를 연결하고 모든 테이블/RPC/Realtime을 cross-household로 검증한다.

### Phase C — production migration

- 현재 household/data 백업 상태 확인
- migration 적용
- 기존 household ID와 데이터 row count 검증
- 기존 연결 기기 정상 접속 확인
- member limit 10 확인
- 기존 household의 실제 `baby_name`, `display_name`을 운영 단계에서 설정
- 메인 화면에서 가구 표시명 확인

### Phase D — 첫 외부 가족 생성

- 실제 두 번째 household 생성
- baby/display name 확인
- 초대 링크 발급
- 첫 기기 연결
- 각 메인 화면에 서로 다른 가구 표시명 노출 확인
- A/B 데이터 격리 확인
- 추가 기기 연결 확인

두 번째 실제 household가 데이터를 사용하기 시작하면 단일 가구 구조로의 destructive rollback은 하지 않는다. 이후 문제는 forward-fix를 원칙으로 한다.

## 11. 필수 테스트 매트릭스

### 기존 가구 보존

- migration 전후 household ID 동일
- 기존 members 유지
- 기존 아기 날짜 유지
- 기존 큐브/식단/먹은 기록/재료/레시피/폐기 유지
- 기존 기기 재인증 불필요
- member limit 10으로 변경
- production 단계에서 설정한 baby/display name 정상 조회

### 가구 생성

- 두 번째/세 번째 household 생성 성공
- `baby_name` 필수 검증
- `display_name` 필수 검증
- 서로 다른 household가 같은 display name을 가져도 보안상 문제 없음
- 새 household는 사용 데이터 0건으로 시작
- 기본 member limit 10

### 이름/프로필

- 가구 A user는 A의 baby/display name만 조회 가능
- 가구 B profile 조회 실패
- baby name 수정 시 다른 가구 영향 없음
- display name 수정 시 다른 가구 영향 없음
- baby name 수정이 display name을 자동 덮어쓰지 않음
- 이름이 null인 migration 과도기 기존 가구에서는 UI fallback 정상
- 실제 production 이름이 코드/test fixture에 하드코딩되지 않음

### 메인 UI

- 이름 설정 시 브랜드 서브카피에 `{displayName} 이유식 냉동실`
- 요약 카드에 `{displayName} 냉동실에 모두`
- 이름 미설정 시 안전한 기존 문구 fallback
- 가구 A/B 브라우저에서 각자 다른 표시명 노출

### 기기 한도

- 1~10번째 연결 성공
- 10번째 성공 시 invite 자동 마감
- 11번째 실패
- 동시에 10/11번째 claim 시 정확히 한 요청만 마지막 자리 획득
- member 제거 후 한 자리 다시 연결 가능

### 초대

- 정상 token 성공
- 잘못된 token 실패
- 만료/close/rotate 전 token 실패
- rotate 후 token 성공
- 같은 household 동일 user 재claim 안전
- 다른 household에 이미 연결된 user 실패

### RLS / RPC 격리

가구 A user로 가구 B의 다음 데이터 접근이 모두 실패해야 한다.

- household profile + baby/display name
- cube batches
- meal plans
- consumption records/reactions
- ingredients
- recipes
- recipe ingredients
- batch ingredient snapshots
- consumption ingredient snapshots / NEW 기반
- disposals

RPC도 동일하게 검증:

- consume
- create/update/delete cube
- create/complete/delete meal plan
- update/delete consumption
- disposal/cancel disposal
- ingredient/recipe configuration
- household profile update

### Realtime

가구 A 변경 시 가구 B client가 payload를 받거나 refresh 후 볼 수 없어야 한다.

### 브라우저 복구

- 저장소 삭제 후 일반 URL은 invite required
- rotate invite로 새 session 재연결 가능
- 기존 가구 데이터와 이름 유지

## 12. 완료 조건

1. 기존 household가 migration 전과 동일하게 정상 작동한다.
2. 두 개 이상의 household가 동시에 존재한다.
3. 각 household는 최대 10 member를 가진다.
4. 11번째 member는 concurrency 상황에서도 들어갈 수 없다.
5. 모든 household는 `baby_name`과 `display_name`을 독립적으로 관리할 수 있다.
6. 메인 화면에서 현재 가구의 표시명을 확인할 수 있다.
7. 가구 A/B 데이터와 profile이 RLS/RPC/Realtime 수준에서 완전히 격리된다.
8. 운영자가 별도 Supabase 프로젝트나 별도 사이트 없이 새 가족을 초대할 수 있다.
9. 초대가 없는 사용자는 어느 가구 데이터에도 접근할 수 없다.
10. service role/운영자 비밀값과 실제 production 아이 이름이 공개 클라이언트 코드/migration에 노출되지 않는다.

## 13. 1차 범위에서 제외

- 이메일/비밀번호 회원가입
- Google/Apple 로그인
- 사용자의 셀프 가구 생성
- 한 브라우저에서 여러 가구 전환
- 가족 내 관리자/편집자/읽기 전용 역할
- 다자녀 프로필
- 한국어 이름 조사 자동 생성 엔진
- 과금/구독
- 공개 사용자 검색
- 관리자 웹 콘솔

다자녀 지원이 필요해지면 `households.baby_name` 단일 필드를 계속 확장하지 않고 별도 `children` 모델을 설계한다.

## 14. 최종 목표 구조

```text
몽글큐브 하나의 사이트
├─ household A
│  ├─ baby_name: 아이A
│  ├─ display_name: 아이A네
│  ├─ 최대 10개 연결 기기
│  └─ A 가족 데이터만 조회/수정
├─ household B
│  ├─ baby_name: 지안
│  ├─ display_name: 지안이네
│  ├─ 최대 10개 연결 기기
│  └─ B 가족 데이터만 조회/수정
└─ 다른 가족 household ...
   ├─ 독립 아이/가구 이름
   ├─ 최대 10개 연결 기기
   └─ 해당 가족 데이터만 조회/수정
```

사이트와 Supabase 프로젝트는 하나를 유지하되, `household_id`가 모든 데이터의 보안 경계를 형성한다. `baby_name`은 아이 자체의 프로필 값, `display_name`은 사용자와 운영자가 household를 식별하는 이름으로 사용한다.
