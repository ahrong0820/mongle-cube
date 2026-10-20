import { describe, expect, it } from 'vitest'
import foundationSql from '../../supabase/migrations/202610200001_meal_preparation_foundation.sql?raw'

describe('식기에 담기 데이터 경계', () => {
  it('기존 식단/먹은 기록을 건드리지 않고 별도 준비 구조를 추가한다', () => {
    expect(foundationSql).toContain('create table public.meal_preparations')
    expect(foundationSql).toContain('create table public.meal_preparation_items')
    expect(foundationSql).not.toContain('drop table')
    expect(foundationSql).not.toContain('truncate')
    expect(foundationSql).not.toContain('delete from public.')
    expect(foundationSql).not.toContain('alter table public.consumption_records')
    expect(foundationSql).not.toContain('alter table public.meal_plan_items')
  })

  it('가구별 복합 외래키와 RLS로 다른 가구의 큐브를 참조하지 못한다', () => {
    expect(foundationSql).toContain('foreign key (preparation_id, household_id)')
    expect(foundationSql).toContain('foreign key (batch_id, household_id)')
    expect(foundationSql).toContain('private.is_household_member(household_id)')
    expect(foundationSql).toContain('enable row level security')
  })

  it('일반 authenticated 클라이언트가 재고 관련 테이블을 직접 수정하지 못한다', () => {
    expect(foundationSql).toContain(
      'revoke all on table public.meal_preparations from public, anon, authenticated;',
    )
    expect(foundationSql).toContain(
      'revoke all on table public.meal_preparation_items from public, anon, authenticated;',
    )
    expect(foundationSql).toContain(
      'grant select on table public.meal_preparations to authenticated;',
    )
    expect(foundationSql).toContain(
      'grant select on table public.meal_preparation_items to authenticated;',
    )
  })

  it('실제로 먹은 양과 준비 수량은 별개로 저장한다', () => {
    expect(foundationSql).toContain('actual_consumed_amount')
    expect(foundationSql).toContain("outcome in ('all', 'partial', 'none')")
    expect(foundationSql).toContain('prepared_quantity')
    expect(foundationSql).toContain('consumed_quantity + discarded_quantity + corrected_quantity <= prepared_quantity')
    expect(foundationSql).toContain('completion_request_id uuid unique')
  })
})
