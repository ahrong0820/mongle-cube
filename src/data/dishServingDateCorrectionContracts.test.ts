import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/202610220001_correct_dish_serving_date.sql?raw'

describe('식기 날짜 정정 DB 계약', () => {
  it('가구 멤버만 미완료 식기의 어제 날짜를 오늘로 바꾼다', () => {
    expect(sql).toContain('private.current_household_id()')
    expect(sql).toContain('prep.household_id = v_household_id')
    expect(sql).toContain('for update;')
    expect(sql).toContain("v_prep.status <> 'prepared'")
    expect(sql).toContain('p_new_serving_on <> v_today')
    expect(sql).toContain('v_prep.serving_on <> v_today - 1')
    expect(sql).toContain("at time zone 'Asia/Seoul'")
  })
  it('재고와 먹은 기록에는 접근하지 않고 충돌을 처리한다', () => {
    expect(sql).toContain('set serving_on = p_new_serving_on')
    expect(sql).toContain('exception when unique_violation then')
    expect(sql).not.toMatch(/update public.cube_batches/i)
    expect(sql).not.toMatch(/update public.consumption_records/i)
    expect(sql).not.toMatch(/update public.meal_preparation_items/i)
  })
  it('익명 권한을 막고 로그인 사용자만 호출할 수 있다', () => {
    expect(sql).toContain('from public, anon;')
    expect(sql).toContain('to authenticated;')
    expect(sql.split('$function$').length - 1).toBe(2)
  })
})
