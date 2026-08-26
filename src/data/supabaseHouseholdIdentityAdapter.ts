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

export function attachSupabaseHouseholdIdentitySupport(
  repository: CubeRepository,
): CubeRepository {
  if (repository.mode !== 'shared') return repository

  const { client, householdId } = repository as unknown as SupabaseRepositoryInternals
  const updateBabyProfile = repository.updateBabyProfile.bind(repository)

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
    await updateBabyProfile(profile)
    return repository.getBabyProfile()
  }

  return repository
}
