# 휴대폰 4~5대 공유 연결하기

평소에는 이 문서를 볼 필요가 없습니다. 로컬 화면 확인이 끝나고 GitHub Pages에 올릴 때 한 번만 설정합니다.

필요한 가입은 사이트를 관리할 사람의 **GitHub와 Supabase 두 곳**뿐입니다. 함께 사용할 가족과 다른 휴대폰은 어디에도 가입하지 않습니다.

## 1. Supabase 프로젝트 만들기

1. [Supabase Dashboard](https://supabase.com/dashboard)에서 새 프로젝트를 만듭니다.
2. Region은 `Northeast Asia (Seoul)`을 선택합니다.
3. `Authentication → Sign In / Providers`에서 `Allow anonymous sign-ins`를 켭니다.
4. 다른 로그인 제공자는 설정하지 않아도 됩니다.

## 2. 데이터 구조 만들기

1. Dashboard의 `SQL Editor`를 엽니다.
2. [초기 SQL](../supabase/migrations/202608240001_initial_schema.sql) 전체를 붙여 넣고 실행합니다.
3. 이어서 [기록 수정·삭제와 다중 식단 SQL](../supabase/migrations/202608250001_record_edit_and_multi_meal.sql) 전체를 붙여 넣고 실행합니다.
4. 에러 없이 완료되면 표와 보안 규칙, 실시간 갱신 설정이 함께 만들어집니다. 이미 초기 SQL을 적용한 프로젝트라면 3번의 새 SQL만 실행하면 됩니다.

이 SQL은 다음을 보장합니다.

- 초대된 최대 5개 휴대폰·태블릿·브라우저만 큐브를 조회하고 수정할 수 있음
- 제작 시각을 바꾸면 기한이 서버에서 항상 `+14일`로 재계산됨
- `먹었어요` 한 번에 수량 차감과 먹은 기록이 함께 저장됨
- 식단 계획만 추가할 때는 재고가 그대로이며, 완료할 때만 재고·식단·먹은 기록이 함께 바뀜
- 한 끼에 서로 다른 큐브와 토핑 여러 종류를 한 번에 안전하게 저장함
- 지난 먹은 기록의 날짜·시간, 아기 반응과 메모를 수정할 수 있음
- 어느 먹은 기록이든 삭제하면 가능한 경우 재고가 복원되고 연결된 식단 항목도 다시 미완료로 돌아감
- 아기 생일·이유식 시작일과 큐브 역할이 연결된 기기 사이에 함께 저장됨
- 여러 기기에서 동시에 마지막 큐브를 눌러도 수량이 음수가 되지 않음
- 기록 삭제를 여러 기기에서 동시에 눌러도 재고가 한 번만 복원됨
- 오래 열어 둔 수정 창이 다른 기기의 최신 수량을 덮어쓰지 않음
- 삭제는 모든 연결 기기에 안정적으로 전달되도록 내부적으로 숨김 처리됨

## 3. 프로젝트 주소와 키 넣기

Dashboard의 `Project Settings → API Keys`에서 아래 두 값을 확인합니다.

- Project URL
- Publishable key (`sb_publishable_...`)

로컬에서 공유 연결을 시험할 때만 프로젝트 루트에 `.env.local`을 만들고 다음처럼 입력합니다.

```dotenv
VITE_SUPABASE_URL=https://프로젝트주소.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_키
```

키를 비워 두면 앱은 자동으로 로컬 시험 모드가 됩니다. `.env.local`은 Git에 올라가지 않습니다.

> 최종 배포 전에는 로컬 공유 시험을 생략하는 편이 가장 간단합니다. 익명 연결은 웹 주소마다 별도이므로, 로컬에서 연결한 브라우저는 GitHub Pages 주소의 연결로 이어지지 않습니다.

## 4. GitHub Pages용 값 등록하기

GitHub 저장소의 `Settings → Secrets and variables → Actions`에서 등록합니다.

| 구분 | 이름 | 값 |
|---|---|---|
| Variable | `VITE_SUPABASE_URL` | Supabase Project URL |
| Secret | `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable key |

그다음 `Settings → Pages → Source`를 `GitHub Actions`로 선택합니다. 이 프로젝트의 [배포 워크플로](../.github/workflows/deploy.yml)가 테스트, 빌드, 배포를 처리합니다.

## 5. 휴대폰 4~5대 연결하기

GitHub Pages 배포가 끝난 뒤 Supabase SQL Editor에서 아래를 한 번 실행합니다.

```sql
select * from private.bootstrap_household('우리집 냉동실', 5);
```

마지막 숫자는 연결할 기기 수이며 `4` 또는 `5`로 정하면 됩니다. 결과의 `invite_token`은 24시간 동안 유효한 64자리 문자열입니다. 다음 주소를 **토큰이 포함된 상태로 먼저 복사해 둡니다.**

```text
https://내아이디.github.io/저장소이름/#invite=64자리토큰
```

1. 첫 번째 휴대폰에서 이 주소를 한 번 엽니다.
2. 정상적으로 냉동실 화면이 보이면, 복사해 둔 **같은 주소**를 사용할 나머지 휴대폰·태블릿에서 각각 한 번씩 엽니다.
3. 설정한 마지막 기기가 연결되면 초대 토큰은 자동으로 잠깁니다. 설정한 수보다 적게 연결하고 마칠 경우에는 아래 SQL로 남은 초대 자리도 잠급니다.
4. 연결을 마친 기기에서는 이후 토큰 없는 일반 GitHub Pages 주소로 들어가면 됩니다.
5. 사용할 기기 연결이 끝나면 Supabase의 `Allow anonymous sign-ins`를 다시 꺼두세요. 새 기기를 연결할 때만 잠시 켜면 불필요한 익명 사용자 생성을 막을 수 있습니다.

```sql
select private.close_household_invite('bootstrap에서 받은 household_id');
```

토큰은 연결 직후 주소창에서 자동으로 지워집니다. 모든 기기 연결과 잠금이 끝날 때까지 원본 링크는 본인이 따로 보관하고, 가족 채팅방 밖에는 공개하지 마세요.

## 휴대폰을 바꾸거나 브라우저 데이터를 지운 경우

익명 연결은 비밀번호 계정이 아니므로 자동 복구되지 않습니다. SQL Editor에서 현재 연결을 확인합니다.

```sql
select household_id, user_id, joined_at
from public.household_members
order by joined_at;
```

교체할 브라우저의 `user_id`와 `household_id`를 넣어 해당 연결을 제거하고 새 토큰을 만듭니다.

```sql
select private.rotate_household_invite(
  'household_id',
  '교체할_user_id'
);
```

반환된 새 토큰으로 `#invite=...` 주소를 만들어 새 기기에서 한 번 열면 됩니다. 큐브 데이터는 그대로 유지됩니다. 아직 5대 미만이고 기존 기기를 제거할 필요가 없다면 두 번째 인자를 `null`로 실행해 빈 자리에 연결할 새 링크만 발급할 수 있습니다.

```sql
select private.rotate_household_invite('household_id', null);
```

## 참고

- [Supabase 익명 로그인 안내](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Row Level Security 안내](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- 이 앱은 유효한 초대 형식이 있을 때만 익명 사용자를 만들며, 초대는 최대 5개 기기가 연결되면 잠깁니다.
