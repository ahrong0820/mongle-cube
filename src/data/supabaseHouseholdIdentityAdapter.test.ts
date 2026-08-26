import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { CubeRepository } from './repository'
import { attachSupabaseHouseholdIdentitySupport } from './supabaseHouseholdIdentityAdapter'

describe('shared 가구 프로필 저장', () => {
  it('현재 household용 RPC에 이름과 날짜를 함께 전달한다', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          baby_name: '하준',
          display_name: '하준이네',
          baby_birth_date: '2026-03-09',
          weaning_started_on: '2026-08-16',
        },
      ],
      error: null,
    })

    const repository = {
      mode: 'shared',
      client: { rpc } as unknown as SupabaseClient,
      householdId: 'household-a',
    } as unknown as CubeRepository

    attachSupabaseHouseholdIdentitySupport(repository)

    const result = await repository.updateBabyProfile({
      babyName: ' 하준 ',
      displayName: ' 하준이네 ',
      birthDate: '2026-03-09',
      weaningStartedOn: '2026-08-16',
    })

    expect(rpc).toHaveBeenCalledWith('update_household_profile', {
      p_baby_name: '하준',
      p_display_name: '하준이네',
      p_birth_date: '2026-03-09',
      p_weaning_started_on: '2026-08-16',
    })
    expect(result).toEqual({
      babyName: '하준',
      displayName: '하준이네',
      birthDate: '2026-03-09',
      weaningStartedOn: '2026-08-16',
    })
  })

  it('DB validation 오류는 사용자에게 그대로 전달한다', async () => {
    const repository = {
      mode: 'shared',
      client: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '22023', message: '가구 이름은 1~40자여야 합니다.' },
        }),
      } as unknown as SupabaseClient,
      householdId: 'household-a',
    } as unknown as CubeRepository

    attachSupabaseHouseholdIdentitySupport(repository)

    await expect(
      repository.updateBabyProfile({
        babyName: '하준',
        displayName: null,
        birthDate: null,
        weaningStartedOn: null,
      }),
    ).rejects.toThrow('가구 이름은 1~40자여야 합니다.')
  })
})
