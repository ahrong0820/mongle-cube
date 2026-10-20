import { describe, expect, it } from 'vitest'
import legacyGuardMigration from '../../supabase/migrations/202610200003_prepared_origin_edit_safety.sql?raw'
import partialMigration from '../../supabase/migrations/202610200004_partial_item_semantics.sql?raw'

describe('식기에 담아 먹은 기록의 정정·부분 섭취 안전 계약', () => {
  it('기존 개별 반응/시간 수정과 일괄 수정에서 prepared 원본을 가로채지 못한다', () => {
    for (const name of [
      'update_consumption_record',
      'update_consumption_reaction',
      'update_consumption_records_time',
    ]) expect(legacyGuardMigration).toContain(`public.${name}`)
    expect((legacyGuardMigration.match(/preparation_item_id is not null/g) ?? [])).toHaveLength(3)
    expect(legacyGuardMigration).toContain("raise sqlstate 'PT409'")
  })

  it('준비 이력이 남은 제조 배치를 잘못 등록 삭제할 수 없다', () => {
    expect(legacyGuardMigration).toContain('public.delete_cube_batch')
    expect(legacyGuardMigration).toContain('from public.meal_preparation_items item')
    expect(legacyGuardMigration).toContain('item.batch_id = v_batch.id')
  })

  it('부분 섭취는 완전 섭취나 미섭취 상태와 구분하고 정정이 가능하다', () => {
    expect(partialMigration).toContain("'offered_partial'")
    expect(partialMigration).toContain("p_outcome='partial' then 'offered_partial'")
    expect(partialMigration).toContain("('consumed','offered_partial','unused')")
  })
})
