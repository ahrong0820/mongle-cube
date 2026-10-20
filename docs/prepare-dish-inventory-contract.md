# 식기에 담기 — 준비·섭취·재고 계약 (2026-10)

상태: **구현 기준안**. 현재 배포된 식단 화면/RPC를 곧바로 교체하지 않는다.

## 목적

사용자가 전날 실제로 식기에 담아 냉장 해동해둔 큐브와 식사 직전 새로 만들어 추가한 음식을 같은 끼니에 기록하고, 식사 후 한 번만 완료할 수 있게 한다.

기존 `식단` 탭을 `식기에 담기`로 교체하되, DB의 기존 `meal_plan_items`를 준비 재고로 재해석하지 않는다.

## 조사된 현재 상태 (2026-10-20, production read-only)

- 활성 legacy 식단 항목: 0개
- 활성 먹은 기록: 450건
- 활성 생산 배치: 59개 (이 중 냉동 재고가 있는 배치 10개)
- existing `complete_meal_plan_item`: 식단 항목별 완료 때 재고 1개 차감 + consumption record 생성
- existing `delete_consumption_record`/`undo_consumption`: 특정 조건에서 차감된 재고를 복원
- existing `create_cube_batch_with_ingredients`: 큐브/실제 재료/제조 배치 snapshot 생성, 초기 재고 0 허용
- 가구 데이터 분리: authenticated JWT + household membership, RLS/RPC

모든 기존 먹은 기록과 제조 배치, household membership을 보존한다.

## 용어

- **제조 배치**: 만든 큐브의 물리적인 생산 이력 (`cube_batches`).
- **냉동 재고**: 아직 냉동실에 남은 실물 개수 (`cube_batches.quantity`).
- **식기 준비**: 특정 날짜/끼니에 실제로 식기에 담아둔 내용. 아직 섭취가 아님.
- **준비 품목**: 식기에 담긴 특정 배치 출처의 큐브와 개수.
- **당일 제조**: 냉동 재고를 거치지 않고 식기에 직접 담은 분량. 단, 실제 제조 배치/재료 snapshot은 남긴다.
- **완료**: 실제 섭취량·섭취 여부·남은 음식 처리를 확정.

## UX 상태 전이

```
[큐브 선택(미저장)] --실제 식기에 담기 확정--> [준비됨]
[준비됨] --냉동 큐브 추가 / 당일 제조 즉시 추가--> [준비됨(구성 변경)]
[준비됨] --잘못 선택한 항목 취소--> [준비됨, 재고 정정]
[준비됨] --실제로 담은 항목 폐기--> [준비됨, 재고 복원 없음]
[준비됨] --전부/일부/먹지 않음 확정--> [식사 완료]
```

- 날짜는 **먹일 날짜**, 준비 시각은 **실제로 식기에 담은 시각**으로 각각 별도 저장한다.
- 한 날짜의 첫/둘째/셋째 끼니를 명시적으로 선택한다. 기존 식단 테이블의 breakfast/lunch/dinner와 연계 시 레이블 호환을 유지한다. 간식은 별도 유지할 수 있다.
- 식기 준비는 실제 물리적 행위일 때만 확정하며, 단순 큐브 체크 중에는 재고를 변경하지 않는다.
- 가족 두 기기가 동일한 식기를 수정할 수 있으므로 마지막 갱신 버전과 잠금/충돌 오류를 제공한다.
- 완료 후 준비 구성/수량을 수정하려면 단순 재고 수정이 아니라 명시적인 기록 정정 흐름을 거친다.

## 데이터 모델 (기존 테이블 재사용 금지)

### meal_preparations

- id, household_id
- serving_on (먹일 서울 날짜), meal_slot (첫/둘째/셋째/간식의 안정적인 코드)
- status (prepared/completed/cancelled)
- prepared_at, updated_at
- completed_at, consumed_at (실제 식사 시각)
- outcome (all/partial/none)
- actual_consumed_amount, actual_consumed_unit (실제로 알 수 있는 경우만; g/mL)
- reaction, reaction_note
- completion_request_id (멱등 요청 키)
- created_at

동일 가구·날짜·끼니의 활성 준비 기록은 하나만 허용하되, 완전히 취소한 준비 기록은 이력으로 보존한다.

### meal_preparation_items

- id, household_id, preparation_id, batch_id
- source_kind (frozen/direct_fresh)
- prepared_quantity (1 이상)
- name, category, unit_amount, unit, ingredient snapshot (배치/실제 재료 테이블 연계)
- disposition (ready, consumed, discarded, corrected)
- prepared_at, updated_at
- consumed_quantity (확실히 아는 경우), discarded_quantity
- correction reason / provenance (선택 실수 정정인지, 실제 해동·폐기인지)

실물 큐브의 각 움직임은 하나의 DB 트랜잭션에서 기록한다.

### 섭취 이력 연결

- 기존 `consumption_records`를 수정 없이 대체하지 않는다.
- 준비를 통해 섭취한 기록의 출처를 명확하게 연결한다(새 nullable FK 또는 별도 매핑).
- 냉동 재고는 **준비 시 이미 차감**했으므로 섭취 완료/먹은 기록 삭제/되돌리기 때 **추가 차감 또는 자동 재고 복원 금지**.
- 기존 legacy 식단/직접 먹음 이력은 종전 방식으로 유지.
- 취소된 prepared-consumption 기록의 재고 처리도 **준비 물리 사건의 ledger**를 근거로 판단한다.
- meal 완료 후 한 번에 생성한 기록은 모두 **동일한 실제 섭취 시각**을 사용하여 달력의 끼니별 그룹과 일치시킨다.

## 정확한 섭취량 — 중요한 예외

완전히 먹은 경우에는 준비한 각 큐브를 1개 단위 consumption record로 남길 수 있다.

**여러 큐브를 섞어서 일부만 먹은 경우**에는 어느 큐브 몇 개를 먹었는지 알 수 없다.

- `일부 먹음` + 실제 먹은 총량(알 때만)을 **끼니 단위의 사실**로 저장한다.
- 준비한 총량을 실제 섭취량으로 간주하지 않는다.
- 먹은 것을 확인할 수 없는 개별 재료에 100% 섭취/NEW/중량을 만들어 넣지 않는다.
- AI CSV, 달력, 기록 목록에 `준비한 양`과 `실제 먹은 양`을 **구분**해서 표현하도록 확장한다.
- 부분 섭취의 재료 노출 여부는 `먹은 것이 확실함 / 알 수 없음`을 구분한다. 알 수 없는 경우 NEW의 확정 판정에 사용하지 않는다.
- 화면이 이 데이터를 정확하게 표현할 수 있기 전에 부분 섭취를 기존 consumption record로 일괄 기록하는 구현을 배포하지 않는다.

먹이지 않고 폐기한 경우에는 consumption record를 생성하지 않는다.

## 재고 invariant

1. `frozen` 준비 확정: frozen batch.quantity -= prepared_quantity, 준비 품목 이력 생성. **원자적**.
2. `direct_fresh` 추가: 실제 제조 배치/재료 snapshot을 생성하고 0 재고로 식기 준비에 연결한다. 냉동 재고는 증가하거나 차감하지 않는다.
3. 바로 만든 총 6개 중 냉동 5개 + 식기 1개: batch.quantity는 5개, 준비 품목은 1개. 두 수량을 합쳐 제조 총 6개 검증. 이것도 원자적.
4. 준비된 frozen 품목 완료: 추가 재고 차감 없음.
5. 실제 담기 전 선택 오류만 재고 정정 가능. 이미 해동/제공했다면 자동 복원 금지; 폐기 event 기록.
6. 완료한 준비 기록을 먹은 기록에서 지워도 냉동 재고로 자동 복원하지 않음.
7. 동일 배치를 두 기기에서 동시에 준비해도 row lock/conditional UPDATE로 음수 재고 불가.
8. 동일 준비 기록의 완료 RPC 중복 호출/응답 유실/재시도 시 멱등, consumption record 중복 불가.
9. 일부 항목 실패 시 준비/재고/섭취가 절반만 반영되는 상태 불가 (하나의 트랜잭션).
10. 앱 버전이 구형인 동안 기존 RPC도 작동하므로 새 준비 출처와 기존 직접 섭취 경로를 DB에서 안전하게 구별한다.

## 기록·재료 invariant

- 실제 재료는 당시 `cube_batch_ingredients` snapshot 기준.
- 제조 배치/레시피와 실제 냉동 재고의 개수는 다른 개념. direct_fresh도 별도 생산 batch 기록을 유지.
- NEW는 **실제 섭취/노출이 확인된** 재료에서만 계산한다; 단순 준비/폐기에서는 변화 없음.
- 반응은 한 끼의 관찰이 우선이며 재료 인과관계로 해석하지 않는다.
- 섭취량의 정밀도가 불확실한 부분 섭취를 그램 단위의 확정치로 보여주지 않는다.
- 다른 가구의 배치/준비/먹은 기록 ID가 섞인 RPC는 전체 실패.
- RLS에서 가구 읽기 격리; 준비/완료 write는 membership guard를 가진 전용 RPC만.

## 구현·배포 순서

1. **계약과 테스트 기준 확정** (이 문서).
2. **추가형 DB schema + 준비/추가/정정/폐기/일괄 완료 RPC** 신규 migration. 기존 RPC의 prepared-origin 삭제/되돌리기 방지 포함. production 데이터는 변경하지 않음.
3. transaction rollback 검증: 동시 차감, 0재고, cross-household, 재시도 멱등성, direct_fresh, 일부 먹음, 오류 정정/폐기, 기존 데이터 보존.
4. repository adapter + local mode 같은 상태 전이 구현.
5. 기존 `식단` 탭을 `식기에 담기`로 교체, 오늘/내일 첫·둘째·셋째 끼니, 큐브 선택, 확정, 준비물 추가/교체, 1회 식사 완료.
6. 달력/먹은 기록/AI CSV가 부분 섭취와 준비 출처를 정확히 보여주도록 연동.
7. 자동 테스트 → TypeScript → production build → PR merge → GitHub Pages 배포.
8. 배포 후 실사용 재고를 직접 변경하지 않는 읽기 검증. 실제 식기 생성/섭취 시뮬레이션은 DB transaction 안에서 rollback하여 검증.

## 수용 테스트 목록

- 전날 4개 냉동 준비 후 다음날 fresh 1개 추가, 한 끼 완료
- fresh 6개 생산하여 5개만 냉동, 1개는 식기로 즉시 이동
- 2끼/3끼 분리 + 같은 식기의 재료 여러 종류·동일 큐브 여러 개
- 가족 기기 A와 B의 동시 추가/완료, 중복 요청 멱등
- 계획 선택 중 취소: 재고 변화 없음
- 냉동 준비 확정: 정확히 1회 차감
- 실제로 꺼내지 않은 등록 실수 정정: 명시적 복원
- 해동 후 교체·폐기: 재고 복원 없음
- 전부 먹음/일부 먹음/전혀 먹지 않음 분리
- partial 혼합: 실제 섭취 총량만, 재료/큐브별 섭취량 추측 없음
- 같은 배치 0 재고에서 추가 준비 차단
- 다른 가구 ID 참조 차단
- 기존 450건 먹은 기록, 과거 snapshot, 기존 59개 생산 배치 보존
- legacy 직접 먹음/먹은 기록 수정/삭제/재고 되돌리기 회귀 통과

## 운영 주의

- 사용자가 전날 실제 냉장칸에 담아놓았다는 기록이지, 앱이 실물의 위생·보관 안전을 판정하는 기능은 아님.
- 준비 시각과 보관 방법을 기록하고 안내할 수 있지만 식품 상태를 자동으로 안전 판정하지 않는다.
- 아직 생산/섭취/정정 UI가 연동되지 않은 DB 단독 migration만으로 기능이 완성되었다고 보고하지 않는다.
