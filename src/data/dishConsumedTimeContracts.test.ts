import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/202610220002_update_dish_consumed_time.sql?raw'

describe('식기 완료 끼니 시간 변경 계약', () => {
  it('완료 상태와 가구 권한을 확인하고 예상 섭취 시각으로 충돌을 검출한다', () => {
    expect(sql).toContain('private.current_household_id()')
    expect(sql).toContain('prep.household_id = v_household_id')
    expect(sql).toContain('for update;')
    expect(sql).toContain("v_prep.status <> 'completed'")
    expect(sql).toContain('v_prep.consumed_at <> p_expected_consumed_at')
    expect(sql).toContain("at time zone 'Asia/Seoul'")
  })
  it('끼니 및 모든 준비 출처 기록의 시간만 갱신하고 물리 재고를 건드리지 않는다', () => {
    expect(sql).toContain('update public.consumption_records as record')
    expect(sql).toContain('update public.meal_preparations as prep')
    expect(sql).toContain('item.preparation_id = v_prep.id')
    expect(sql).not.toMatch(/update public.cube_batches/i)
    expect(sql).not.toMatch(/insert into public.consumption_records/i)
    expect(sql).not.toMatch(/update public.meal_preparation_items/i)
  })
  it('익명 실행을 차단하고 기존 저장소 RPC를 교체하지 않는다', () => {
    expect(sql).toContain('from public,anon;')
    expect(sql).toContain('to authenticated;')
    expect(sql).not.toContain('create or replace function public.update_consumption_records_time')
    expect(sql.split('$function$').length - 1).toBe(2)
  })
})
