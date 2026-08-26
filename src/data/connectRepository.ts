import { LocalCubeRepository } from './localRepository'
import { AppConfigurationError, type CubeRepository } from './repository'
import { attachSupabaseDisposalSupport } from './supabaseDisposalAdapter'
import { attachSupabaseHouseholdIdentitySupport } from './supabaseHouseholdIdentityAdapter'
import { connectSupabaseRepository } from './supabaseRepository'

export async function connectRepository(): Promise<CubeRepository> {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url && !key) return new LocalCubeRepository()

  if (!url || !key) {
    throw new AppConfigurationError(
      'Supabase 주소와 publishable key가 모두 필요해요. .env.local 설정을 확인해 주세요.',
    )
  }

  const repository = await connectSupabaseRepository(url, key)
  attachSupabaseHouseholdIdentitySupport(repository)
  return attachSupabaseDisposalSupport(repository)
}
