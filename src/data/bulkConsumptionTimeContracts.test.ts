import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/202609040001_bulk_consumption_time.sql?raw'
import supabaseRepositorySource from './supabaseRepository.ts?raw'

describe('먹은 기록 시간 일괄 수정 계약', () => {
  it('Supabase 저장소는 전용 RPC를 한 번만 호출한다', () => {
    expect(supabaseRepositorySource).toContain("rpc('update_consumption_records_time'")
    expect(supabaseRepositorySource).toContain('p_record_ids: recordIds')
    expect(supabaseRepositorySource).toContain('p_time: time')
  })

  it('RPC는 같은 가구의 활성 기록을 잠근 뒤 한 transaction에서 수정한다', () => {
    expect(migration).toContain('security definer')
    expect(migration).toContain('private.is_household_member(record.household_id)')
    expect(migration.toLowerCase()).toContain('for update')
    expect(migration).toContain("at time zone 'Asia/Seoul'")
    expect(migration).toContain('v_record_count <> pg_catalog.cardinality(p_record_ids)')
    expect(migration).toContain('return query')
  })

  it('RPC는 anon/public 실행을 막고 authenticated에만 연다', () => {
    expect(migration).toContain('from public, anon')
    expect(migration).toContain('to authenticated;')
  })
})
