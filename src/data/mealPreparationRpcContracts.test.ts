import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/202610200002_meal_preparation_rpcs.sql?raw'

describe('식기에 담기 원자적 기록 계약', () => {
  it('실제로 담을 때 한 transaction 내에서 냉동 재고를 차감한다', () => {
    expect(migration).toContain('create or replace function public.create_dish_preparation')
    expect(migration).toContain('from public.add_frozen_dish_items')
    expect(migration).toContain('set quantity = batch.quantity - v_selection.quantity')
    expect(migration).toContain('batch.quantity >= v_selection.quantity')
    expect(migration).toContain('for update;')
  })

  it('당일 제조는 제조 총수와 냉동 보관 개수의 차이만 식기에 넣는다', () => {
    expect(migration).toContain('v_qty := p_total_made - p_to_freeze')
    expect(migration).toContain('public.create_cube_batch_with_ingredients(')
    expect(migration).toContain("'direct_fresh'")
    expect(migration).toContain("p_prepared_at,p_to_freeze,")
  })

  it('준비에서 소비한 기록은 기존 삭제/되돌리기 RPC가 재고로 복원하지 못한다', () => {
    const guards = migration.match(/if v_record\.preparation_item_id is not null then/g)
    expect(guards).toHaveLength(2)
    expect(migration).toContain('public.delete_consumption_record')
    expect(migration).toContain('public.undo_consumption')
  })

  it('한 끼 완료는 멱등이고 일부 먹음은 큐브 단위 섭취량으로 추정하지 않는다', () => {
    expect(migration).toContain("if v_prep.completion_request_id=p_request_id then return v_prep")
    expect(migration).toContain("if p_outcome='all' then")
    expect(migration).toContain('insert into public.consumption_records')
    expect(migration).toContain("outcome=p_outcome")
    expect(migration).toContain('actual_consumed_amount=p_actual_amount')
    expect(migration).toContain('p_outcome=\'partial\'')
  })

  it('모든 새 RPC는 authenticated 전용이고 가구 경계를 검사한다', () => {
    for (const fn of [
      'create_dish_preparation',
      'add_frozen_dish_items',
      'add_fresh_dish_item',
      'remove_dish_item',
      'complete_dish_preparation',
      'cancel_dish_completion',
    ]) {
      expect(migration).toContain(`public.${fn}`)
    }
    expect(migration).toContain('private.current_household_id()')
    expect(migration).toContain('from public,anon;')
    expect(migration).toContain('to authenticated;')
  })
})
