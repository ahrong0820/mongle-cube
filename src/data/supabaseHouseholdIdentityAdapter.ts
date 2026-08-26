import type { SupabaseClient } from '@supabase/supabase-js'
import type { BabyProfile } from '../types'
import type { CubeRepository } from './repository'

interface HouseholdProfileRow {
  baby_name: string | null
  display_name: string
  baby_birth_date: string | null
  weaning_started_on: string | null
}

interface SupabaseRepositoryInternals {
  client: SupabaseClient
  householdId: string
}

function mapHouseholdProfile(row: HouseholdProfileRow): BabyProfile {
  return {
    babyName: row.baby_name,
    displayName: row.display_name,
    birthDate: row.baby_birth_date,
    weaningStartedOn: row.weaning_started_on,
  }
}

function friendlyProfileError(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : ''

  if (['22023', '42501', 'P0002'].includes(code)) {
    return new Error(message || '아기·가족 정보를 저장하지 못했어요.')
  }
  return new Error('아기·가족 정보를 저장하지 못했어요.')
}

export function attachSupabaseHouseholdIdentitySupport(
  repository: CubeRepository,
): CubeRepository {
  if (repository.mode !== 'shared') return repository

  const { client, householdId } = repository as unknown as SupabaseRepositoryInternals

  repository.getBabyProfile = async () => {
    const { data, error } = await client
      .from('households')
      .select('baby_name, display_name, baby_birth_date, weaning_started_on')
      .eq('id', householdId)
      .single()

    if (error) throw error
    return mapHouseholdProfile(data as HouseholdProfileRow)
  }

  repository.updateBabyProfile = async (profile) => {
    const { data, error } = await client.rpc('update_household_profile', {
      p_baby_name: profile.babyName?.trim() || null,
      p_display_name: profile.displayName?.trim() || null,
      p_birth_date: profile.birthDate,
      p_weaning_started_on: profile.weaningStartedOn,
    })

    if (error) throw friendlyProfileError(error)
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('저장한 아기·가족 정보를 확인하지 못했어요.')
    return mapHouseholdProfile(row as HouseholdProfileRow)
  }

  return repository
}
