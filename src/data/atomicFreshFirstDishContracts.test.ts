import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/202610210001_atomic_fresh_first_dish.sql?raw'

describe('최초 당일 제조 식기 준비 원자성 계약', () => {
  it('인증된 가구에만 공개하고 기존 RPC를 변경하지 않는다', () => {
    expect(migration).toContain('create or replace function public.create_fresh_dish_preparation')
    expect(migration).toContain('private.current_household_id()')
    expect(migration).toContain('v_household_id is null')
    expect(migration).toContain('from public, anon;')
    expect(migration).toContain('to authenticated;')
    expect(migration).not.toContain('create or replace function public.add_fresh_dish_item')
  })

  it('준비 행 생성과 제조/재료 snapshot 생성을 하나의 트랜잭션에 둔다', () => {
    expect(migration).toContain('insert into public.meal_preparations')
    expect(migration).toContain('perform public.add_fresh_dish_item(')
    expect(migration).toContain('v_prep.id, p_recipe_id')
    expect(migration).toContain('exception when unique_violation then')
    expect(migration).toContain("at time zone 'Asia/Seoul'")
    expect(migration).not.toContain('update public.cube_batches')
  })

  it('함수 구분자와 권한 명령이 닫힌다', () => {
    expect(migration.split('$function$').length - 1).toBe(2)
    expect(migration.trim().endsWith('to authenticated;')).toBe(true)
  })
})
