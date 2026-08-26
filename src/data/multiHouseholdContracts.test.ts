import { describe, expect, it } from 'vitest'
import supabaseRepositorySource from './supabaseRepository.ts?raw'
import phaseAMigration from '../../supabase/migrations/202608260005_multi_household_foundation.sql?raw'
import profileMigration from '../../supabase/migrations/202608260006_household_profile_update.sql?raw'

describe('다중 가구 보안 계약', () => {
  it('Realtime 구독은 현재 household_id로만 필터링한다', () => {
    for (const table of [
      'cube_batches',
      'consumption_records',
      'meal_plan_items',
      'ingredients',
      'cube_recipes',
      'cube_recipe_ingredients',
      'cube_batch_ingredients',
      'consumption_record_ingredients',
    ]) {
      expect(supabaseRepositorySource).toContain(`'${table}'`)
    }

    expect(supabaseRepositorySource).toContain('filter: `household_id=eq.${this.householdId}`')
    expect(supabaseRepositorySource).toContain("table: 'households'")
    expect(supabaseRepositorySource).toContain('filter: `id=eq.${this.householdId}`')
  })

  it('초대 claim은 초대 행을 잠그고 member_limit 검사 후 마지막 자리에서 마감한다', () => {
    expect(phaseAMigration.toLowerCase()).toContain('for update of invite')
    expect(phaseAMigration).toContain('if v_member_count >= v_member_limit then')
    expect(phaseAMigration).toContain('if v_member_count + 1 >= v_member_limit then')
    expect(phaseAMigration).toContain('set active = false')
    expect(phaseAMigration).toContain('이미 다른 가족 냉동실에 연결된 브라우저예요.')
  })

  it('가구 생성 함수는 private이고 10대 범위와 이름 입력을 강제한다', () => {
    expect(phaseAMigration).toContain('private.create_household_invite')
    expect(phaseAMigration).toContain('p_member_limit not between 1 and 10')
    expect(phaseAMigration).toContain('char_length(btrim(p_baby_name)) not between 1 and 20')
    expect(phaseAMigration).toContain('char_length(btrim(p_display_name)) not between 1 and 40')
    expect(phaseAMigration).toContain('from public, anon, authenticated')
  })

  it('프로필 수정 RPC는 로그인 사용자의 current_household_id만 수정한다', () => {
    expect(profileMigration).toContain('v_household_id := private.current_household_id();')
    expect(profileMigration).toContain('where household.id = v_household_id')
    expect(profileMigration).toContain('grant execute on function public.update_household_profile')
    expect(profileMigration).toContain('to authenticated;')
  })
})
