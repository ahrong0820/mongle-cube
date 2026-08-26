# 몽글큐브 다중 가구 확장 명세서

## 1. 목적

현재 몽글큐브는 하나의 가구가 여러 기기에서 같은 냉동실 데이터를 공유하는 구조다. 이를 한 개의 사이트에서 여러 가족이 각자 독립된 냉동실을 사용할 수 있도록 확장한다.

이 확장의 핵심 목표는 다음과 같다.

- 하나의 GitHub Pages 사이트를 여러 가족이 함께 사용한다.
- 가족별 큐브, 식단, 먹은 기록, 반응, 재료, 레시피, 폐기 기록, 아기 날짜 정보는 완전히 분리한다.
- 각 가족은 최대 10대의 브라우저·휴대폰·태블릿을 연결할 수 있다.
- 현재 사용 중인 우리집 가구와 기존 데이터는 그대로 유지한다.
- 기존의 익명 기기 인증과 초대 링크 방식은 최대한 유지한다.
- 1차 확장에서는 공개 회원가입이나 누구나 새 가구를 만드는 기능을 제공하지 않는다. 운영자가 새 가구를 만들고 초대 링크를 전달한다.

## 2. 용어

### 가구(Household)

한 가족의 완전히 독립된 데이터 영역이다. 각 가구는 고유한 `household_id`를 가진다.

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

가구 A의 사용자는 가구 B의 존재 여부, 아기 정보, 큐브, 식단, 먹은 기록, 재료, 레시피, 폐기 기록을 조회하거나 수정할 수 없어야 한다.

### 3.2 한 브라우저는 한 가구에만 속한다

현재 `household_members.user_id`의 고유성은 유지한다.

한 anonymous user가 동시에 두 가구에 속하는 기능은 제공하지 않는다. 이미 가구 A에 연결된 브라우저에서 가구 B 초대 링크를 열면 명확한 오류를 표시한다.

예:

> 이미 다른 가족 냉동실에 연결된 브라우저예요.

필요하면 다른 브라우저 프로필을 사용하거나 기존 연결을 운영자가 제거한 뒤 새 가구에 연결한다.

### 3.3 가족당 최대 10대

- 신규 가구 기본 `member_limit`: 10
- 허용 범위: 1~10
- 기존 우리집 가구도 migration 시 10대로 상향한다.
- 10번째 연결이 성공하면 해당 초대는 자동 마감한다.
- 11번째 연결은 반드시 거부한다.
- 동시에 여러 기기가 마지막 자리를 요청해도 10대를 초과하면 안 된다.

## 4. 사용자 흐름

### 4.1 기존 우리집 사용

다중 가구 migration 이후에도 현재 사용 흐름은 바뀌지 않는다.

- 기존 `household_id` 유지
- 기존 `household_members` 유지
- 기존 큐브·먹은 기록·식단·재료·레시피·폐기·아기 날짜 데이터 유지
- 기존 연결 기기는 재연결 불필요
- 기기 한도만 10대로 상향

### 4.2 새 지인 가족 생성

1. 운영자가 Supabase SQL Editor에서 새 가구를 생성한다.
2. 시스템은 `household_id`, `invite_token`, `expires_at`을 반환한다.
3. 운영자가 다음 형식의 링크를 지인에게 전달한다.

```text
https://<site>/#invite=<64자리 토큰>
```

4. 지인의 첫 번째 기기가 링크를 연다.
5. 앱이 anonymous session을 만들고 초대를 claim한다.
6. 해당 기기는 새 가구의 첫 번째 멤버가 된다.
7. 연결 후 URL에서 토큰 fragment는 자동 제거한다.
8. 이후에는 일반 몽글큐브 주소로 접속한다.
9. 같은 가족의 추가 기기도 같은 활성 초대 링크를 사용해 최대 10대까지 연결한다.

### 4.3 초대 마감

초대는 아래 조건 중 하나가 되면 사용할 수 없어야 한다.

- 만료 시각 경과
- `member_limit` 도달
- 운영자가 수동으로 마감
- 새 토큰으로 rotate되어 기존 토큰 폐기

### 4.4 기기 교체

기존 휴대폰을 교체하거나 브라우저 데이터를 삭제한 경우:

1. 운영자가 기존 `household_members.user_id`를 확인한다.
2. 교체 대상 멤버를 제거한다.
3. 새 초대 토큰을 발급한다.
4. 새 기기에서 해당 초대 링크를 연다.
5. 가구 데이터는 그대로 유지한다.

빈 자리가 있는 경우에는 기존 멤버를 제거하지 않고 새 초대만 재발급할 수 있다.

## 5. DB 변경 명세

새 migration만 추가하며 기존 migration 파일은 수정하지 않는다.

### 5.1 `households` 단일 가구 제한 해제

현재 `singleton` 고유 제약 때문에 두 번째 가구를 만들 수 없다.

1차 migration에서는 호환성을 위해 `singleton` 컬럼 자체는 당장 제거하지 않아도 된다. 대신 여러 행 삽입을 막는 unique constraint를 제거한다.

권장:

- `households_singleton_key` 제거
- 기존 `singleton` 컬럼은 deprecated로 남겨 둠
- 후속 정리 migration에서 필요 시 제거

이렇게 하면 기존 앱/데이터에 불필요한 파괴적 변경을 줄일 수 있다.

### 5.2 `member_limit` 10대 상향

현재 허용 범위 `1~5`를 `1~10`으로 변경한다.

- 기본값: 10
- check constraint: `member_limit between 1 and 10`
- 기존 가구: `member_limit = 10`으로 상향

### 5.3 가구 생성 함수

운영자 전용 private 함수 추가를 권장한다.

개념 시그니처:

```sql
private.create_household_invite(
  p_display_name text,
  p_member_limit smallint default 10
)
```

반환:

- `household_id`
- `invite_token`
- `expires_at`
- `member_limit`

동작:

1. display name 검증
2. member limit 1~10 검증
3. 새 household 생성
4. 암호학적으로 안전한 64자리 hex token 생성
5. DB에는 token hash만 저장
6. 24시간 후 만료되는 invite 생성
7. 원문 token은 함수 반환값으로 한 번만 제공

`private` schema 함수는 클라이언트의 `anon`/`authenticated` role에 grant하지 않는다.

### 5.4 초대 claim

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

### 5.5 초대 rotate / close

기존 개념을 다중 가구에서도 유지한다.

```sql
private.rotate_household_invite(
  p_household_id uuid,
  p_remove_user_id uuid default null
)
```

동작:

- 필요 시 기존 멤버 1명을 제거
- 기존 초대를 폐기
- 새 24시간 token 발급
- 가구 데이터는 건드리지 않음

```sql
private.close_household_invite(p_household_id uuid)
```

동작:

- 해당 가구의 현재 invite를 즉시 비활성화

### 5.6 초대 테이블

1차 확장에서는 현재처럼 한 가구당 활성 초대 1개 모델을 유지한다.

현재 `household_invites.household_id`가 PK인 구조는 이 요구에 적합하다.

추후 역할별 초대, 개별 사용자 초대, 초대 감사 로그가 필요해지면 다중 invite 모델로 확장한다.

## 6. 데이터 격리 및 RLS 명세

다중 가구 확장의 가장 중요한 acceptance criterion은 가구 간 데이터 누출이 0이어야 한다는 것이다.

현재 다음 도메인은 모두 `household_id`를 기준으로 분리되어야 한다.

- `households`
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

각 테이블의 RLS는 `private.is_household_member(household_id)` 또는 동등한 가구 멤버십 검사만으로 접근을 허용해야 한다.

### 6.1 Cross-household 금지 항목

가구 A 사용자가 가구 B의 ID를 우연히 또는 고의로 알고 있어도 아래가 모두 실패해야 한다.

- SELECT
- INSERT
- UPDATE
- DELETE/soft delete RPC
- consume RPC
- meal plan RPC
- disposal RPC
- recipe/ingredient RPC
- realtime event 수신

### 6.2 복합 FK 유지

현재 사용 중인 `(id, household_id)` 복합 foreign key 패턴을 유지한다.

예를 들어 가구 A의 batch에 가구 B의 ingredient를 연결하거나, 가구 A의 consumption record가 가구 B의 meal plan을 참조할 수 없어야 한다.

## 7. 인증 및 보안 정책

### 7.1 클라이언트 키

클라이언트에는 기존처럼 Supabase publishable key만 사용한다.

절대 포함하면 안 되는 것:

- service role key
- database password
- private 운영자 token

### 7.2 익명 인증

1차 지인 베타에서는 anonymous sign-in을 유지한다.

데이터 접근은 anonymous auth 자체가 아니라 `household_members` membership과 RLS로 제한한다. 초대가 없는 anonymous user는 어떤 가구 데이터에도 접근할 수 없어야 한다.

공개 서비스 단계로 확대할 경우 anonymous auth abuse, rate limit, CAPTCHA 또는 정식 계정 인증을 별도 검토한다.

### 7.3 초대 링크

- token은 64자리 random hex
- DB에는 SHA-256 등 안전한 hash만 저장
- 기본 유효기간 24시간
- 가족 채팅 등 신뢰 가능한 채널로만 전달
- URL fragment의 token은 claim 후 즉시 제거
- rotate 시 이전 token 즉시 무효화

## 8. 프론트엔드 명세

### 8.1 기존 멤버

현재 세션이 이미 household member라면 일반 URL 접속 시 해당 가구를 자동으로 로드한다.

프론트엔드는 "첫 번째 household" 또는 singleton row를 찾는 가정을 해서는 안 된다.

항상 현재 `auth.uid()`의 `household_members`를 통해 household를 결정한다.

### 8.2 연결되지 않은 브라우저

일반 URL로 접속했지만 membership이 없다면 현재와 동일하게 초대 필요 화면을 보여준다.

추천 문구:

> 가족 냉동실 연결이 필요해요
>
> 받은 몽글큐브 초대 링크를 이 브라우저에서 한 번 열어 주세요.

### 8.3 초대 오류

구분 가능한 오류 문구를 제공한다.

- 초대 만료
- 초대 마감
- 연결 기기 10대 초과
- 잘못된 토큰
- 이미 다른 가구에 연결된 브라우저

### 8.4 가구 이름

`households.display_name`은 데이터 관리와 운영 식별에 사용한다.

1차 버전에서는 UI에 항상 표시할 필요는 없다. 다만 향후 여러 가구를 운영할 때 디버깅을 위해 설정/연결 정보 영역에 표시하는 것은 허용한다.

## 9. 운영 명세

### 9.1 1차 운영 방식

새 지인이 사용하고 싶을 때 운영자가 SQL Editor에서 아래에 해당하는 함수를 호출한다.

```sql
select * from private.create_household_invite('민지네 냉동실');
```

반환된 token으로 초대 링크를 만들어 전달한다.

이 단계에서는 별도 관리자 웹 화면을 만들지 않는다.

이유:

- 가족 수가 적은 초기 단계에서 구현 복잡도를 최소화
- service role 또는 운영 권한을 public frontend에 노출하지 않음
- 실제 사용 패턴을 확인한 뒤 필요한 관리 기능만 설계 가능

### 9.2 향후 관리자 기능 후보

사용 가구가 늘어나 SQL 운영이 불편해질 때 다음 기능을 별도 관리자 영역으로 만든다.

- 가구 목록
- 가구 이름
- 연결 기기 수 / 10
- 초대 생성·재발급·마감
- 마지막 연결 시각
- 오래된 anonymous member 정리

관리자 인증 설계가 확정되기 전에는 public 앱에 이 기능을 넣지 않는다.

## 10. Migration 전략

### Phase A — 다중 가구 DB 기반

새 migration 하나로 아래를 처리한다.

- singleton unique constraint 제거
- member limit 1~10
- default 10
- 기존 household member limit 10으로 상향
- 다중 가구 생성 private RPC
- invite rotate/close 다중 가구 검증
- claim concurrency 재검증

이 단계에서는 두 번째 household를 아직 production에 만들지 않는다.

### Phase B — 격리 자동 테스트

production 적용 전 또는 rollback 가능한 검증 환경에서 최소 두 개의 household를 만든다.

- household A
- household B

각 가구에 서로 다른 anonymous user를 연결하고 모든 테이블/RPC를 cross-household로 공격적으로 검증한다.

### Phase C — production migration

- 현재 household/data 백업 상태 확인
- migration 적용
- 기존 우리집 household ID와 row count 검증
- 현재 연결 기기 정상 접속 확인
- member limit 10 확인

### Phase D — 첫 외부 가족 생성

- 테스트용이 아닌 실제 두 번째 household 생성
- 초대 링크 발급
- 첫 기기 연결
- A/B 데이터 격리 확인
- 추가 기기 연결 확인

한 번 두 번째 실제 household가 생성되고 데이터를 사용하기 시작하면 단일 가구 구조로 되돌리는 destructive rollback은 하지 않는다. 이후 문제는 forward-fix를 원칙으로 한다.

## 11. 필수 테스트 매트릭스

### 기존 가구 보존

- migration 전후 household ID 동일
- 기존 members 유지
- 기존 아기 날짜 유지
- 기존 큐브/식단/먹은 기록/재료/레시피/폐기 유지
- 기존 기기 재인증 불필요

### 가구 생성

- 두 번째 household 생성 성공
- 세 번째 이상 household도 생성 가능
- display name 독립
- 새 household는 데이터 0건으로 시작
- 기본 member limit 10

### 기기 한도

- 1~10번째 기기 연결 성공
- 10번째 성공 시 invite 자동 마감
- 11번째 연결 실패
- 동시에 10번째/11번째 claim 시 정확히 한 요청만 마지막 자리를 획득
- member 제거 후 다시 한 자리 연결 가능

### 초대

- 정상 token 성공
- 잘못된 token 실패
- 만료 token 실패
- close된 token 실패
- rotate 전 token 실패
- rotate 후 token 성공
- 같은 household에서 동일 user 재claim은 안전
- 다른 household에 이미 연결된 user는 실패

### RLS / 데이터 격리

가구 A user로 다음 가구 B 데이터 접근이 모두 실패해야 한다.

- household profile
- cube batches
- meal plans
- consumption records/reactions
- ingredients
- recipes
- recipe ingredients
- batch ingredient snapshots
- consumption ingredient snapshots / NEW 기반
- disposals

RPC도 동일하게 검증한다.

- consume
- create/update/delete cube
- create/complete/delete meal plan
- update/delete consumption
- disposal/cancel disposal
- ingredient/recipe configuration

### Realtime

가구 A에서 데이터를 변경할 때 가구 B client가 해당 payload를 받거나 UI를 refresh해서 볼 수 없어야 한다.

### 브라우저 복구

- 브라우저 저장소 삭제 후 일반 URL에서는 invite required
- rotate invite로 새 세션 재연결 가능
- 기존 가구 데이터 유지

## 12. 완료 조건

다음 조건을 모두 만족해야 다중 가구 기능을 완료로 본다.

1. 기존 우리집 가구가 migration 전과 동일하게 정상 작동한다.
2. 두 개 이상의 household가 DB에 동시에 존재할 수 있다.
3. 각 household는 최대 10개의 member를 가질 수 있다.
4. 11번째 member는 concurrency 상황에서도 절대 들어갈 수 없다.
5. 가구 A와 B 사이의 모든 사용자 데이터가 RLS/RPC/Realtime 수준에서 완전히 격리된다.
6. 운영자가 별도 Supabase 프로젝트나 별도 GitHub Pages 사이트를 만들지 않고 새 가족을 초대할 수 있다.
7. 초대가 없는 사용자는 어느 가구 데이터에도 접근할 수 없다.
8. service role 또는 운영자 비밀값이 웹 클라이언트에 포함되지 않는다.

## 13. 1차 범위에서 제외

다음 기능은 이번 확장에 포함하지 않는다.

- 이메일/비밀번호 회원가입
- Google/Apple 로그인
- 사용자의 셀프 가구 생성
- 한 브라우저에서 여러 가구 전환
- 가족 내 관리자/편집자/읽기 전용 역할
- 과금/구독
- 공개 사용자 검색
- 초대 받은 사람의 이메일 식별
- 관리자 웹 콘솔

필요성이 확인되면 후속 단계로 별도 설계한다.

## 14. 최종 목표 구조

```text
몽글큐브 하나의 사이트
├─ 우리집 household
│  ├─ 최대 10개 연결 기기
│  └─ 우리집 데이터만 조회/수정
├─ 민지네 household
│  ├─ 최대 10개 연결 기기
│  └─ 민지네 데이터만 조회/수정
└─ 다른 가족 household ...
   ├─ 최대 10개 연결 기기
   └─ 해당 가족 데이터만 조회/수정
```

사이트와 Supabase 프로젝트는 하나를 유지하되, `household_id`가 모든 데이터의 보안 경계를 형성한다.
