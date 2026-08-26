import type { BabyProfile } from '../types'
import type { CubeRepository } from './repository'

const LOCAL_IDENTITY_KEY = 'mongle-cube-household-identity-v1'

interface LocalIdentity {
  babyName: string | null
  displayName: string | null
}

function readIdentity(): LocalIdentity {
  try {
    const raw = window.localStorage.getItem(LOCAL_IDENTITY_KEY)
    if (!raw) return { babyName: null, displayName: null }
    const parsed = JSON.parse(raw) as Partial<LocalIdentity>
    return {
      babyName: typeof parsed.babyName === 'string' ? parsed.babyName : null,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
    }
  } catch {
    return { babyName: null, displayName: null }
  }
}

function writeIdentity(profile: BabyProfile) {
  const babyName = profile.babyName?.trim() || null
  const displayName = profile.displayName?.trim() || null
  window.localStorage.setItem(LOCAL_IDENTITY_KEY, JSON.stringify({ babyName, displayName }))
}

export function attachLocalHouseholdIdentitySupport(repository: CubeRepository): CubeRepository {
  if (repository.mode !== 'local') return repository

  const getBabyProfile = repository.getBabyProfile.bind(repository)
  const updateBabyProfile = repository.updateBabyProfile.bind(repository)

  repository.getBabyProfile = async () => ({
    ...(await getBabyProfile()),
    ...readIdentity(),
  })

  repository.updateBabyProfile = async (profile) => {
    const updated = await updateBabyProfile(profile)
    writeIdentity(profile)
    return { ...updated, ...readIdentity() }
  }

  return repository
}
