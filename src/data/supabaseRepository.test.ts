import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CubeDraft } from '../types'
import { consumeInviteToken, SupabaseCubeRepository } from './supabaseRepository'

const householdId = '10000000-0000-4000-8000-000000000001'

const cubeDraft: CubeDraft = {
  name: '쌀미음',
  category: 'base',
  preparedAt: '2026-08-24T01:00:00.000Z',
  quantity: 4,
  unitAmount: 30,
  unit: 'g',
  memo: '첫 베이스',
}

const cubeRow = {
  id: '20000000-0000-4000-8000-000000000001',
  household_id: householdId,
  name: cubeDraft.name,
  category: cubeDraft.category,
  prepared_at: cubeDraft.preparedAt,
  expires_at: '2026-09-07T01:00:00.000Z',
  quantity: cubeDraft.quantity,
  unit_amount: cubeDraft.unitAmount,
  unit: cubeDraft.unit,
  memo: cubeDraft.memo,
  created_at: '2026-08-24T01:00:00.000Z',
  updated_at: '2026-08-24T01:00:00.000Z',
  deleted_at: null,
}

const consumptionRow = {
  id: '30000000-0000-4000-8000-000000000001',
  household_id: householdId,
  batch_id: cubeRow.id,
  cube_name: cubeRow.name,
  unit_amount: cubeRow.unit_amount,
  unit: cubeRow.unit,
  consumed_at: '2026-08-24T01:00:00.000Z',
  created_at: '2026-08-24T01:00:00.000Z',
  cancelled_at: null,
  plan_item_id: null,
  reaction: null,
  reaction_note: null,
}

const mealPlanRow = {
  id: '40000000-0000-4000-8000-000000000001',
  household_id: householdId,
  batch_id: cubeRow.id,
  cube_name: cubeRow.name,
  unit_amount: cubeRow.unit_amount,
  unit: cubeRow.unit,
  planned_for: '2026-08-25',
  meal_slot: 'breakfast',
  consumption_record_id: null,
  created_at: '2026-08-24T02:00:00.000Z',
  updated_at: '2026-08-24T02:00:00.000Z',
  deleted_at: null,
}

function asClient(client: object) {
  return client as unknown as SupabaseClient
}

describe('공유 초대 주소 처리', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('fragment 토큰을 한 번 읽고 즉시 주소에서 지운다', () => {
    const token = 'a'.repeat(64)
    window.history.replaceState({}, '', `/#invite=${token}&view=cubes`)

    expect(consumeInviteToken()).toBe(token)
    expect(window.location.hash).toBe('#view=cubes')
  })

  it('query 토큰은 사용하지 않고 주소에서도 제거한다', () => {
    window.history.replaceState({}, '', `/?invite=${'b'.repeat(64)}&view=cubes`)

    expect(() => consumeInviteToken()).toThrow('초대 링크 주소가 올바르지 않아요')
    expect(window.location.search).toBe('?view=cubes')
  })

  it('형식이 짧은 fragment 토큰도 주소에 남기지 않는다', () => {
    window.history.replaceState({}, '', '/#invite=short')

    expect(() => consumeInviteToken()).toThrow('초대 링크 형식이 올바르지 않아요')
    expect(window.location.hash).toBe('')
  })
})

describe('Supabase 큐브 저장소', () => {
  it('등록할 때 종류를 저장하고 응답 행의 종류를 매핑한다', async () => {
    const single = vi.fn().mockResolvedValue({ data: cubeRow, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ insert }))
    const repository = new SupabaseCubeRepository(asClient({ from }), householdId)

    const created = await repository.create(cubeDraft)

    expect(from).toHaveBeenCalledWith('cube_batches')
    expect(insert).toHaveBeenCalledWith({
      household_id: householdId,
      name: cubeDraft.name,
      category: 'base',
      prepared_at: cubeDraft.preparedAt,
      quantity: cubeDraft.quantity,
      unit_amount: cubeDraft.unitAmount,
      unit: cubeDraft.unit,
      memo: cubeDraft.memo,
    })
    expect(created.category).toBe('base')
  })

  it('수정 RPC에 종류를 전달하고 응답 행의 종류를 매핑한다', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...cubeRow, category: 'snack' },
      error: null,
    })
    const repository = new SupabaseCubeRepository(asClient({ rpc }), householdId)

    const updated = await repository.update(
      cubeRow.id,
      { ...cubeDraft, category: 'snack' },
      cubeRow.updated_at,
    )

    expect(rpc).toHaveBeenCalledWith('update_cube_batch', {
      p_batch_id: cubeRow.id,
      p_expected_updated_at: cubeRow.updated_at,
      p_name: cubeDraft.name,
      p_category: 'snack',
      p_prepared_at: cubeDraft.preparedAt,
      p_quantity: cubeDraft.quantity,
      p_unit_amount: cubeDraft.unitAmount,
      p_unit: cubeDraft.unit,
      p_memo: cubeDraft.memo,
    })
    expect(updated.category).toBe('snack')
  })

  it('여러 큐브 선택을 한 번의 식단 RPC로 저장한다', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [mealPlanRow], error: null })
    const repository = new SupabaseCubeRepository(asClient({ rpc }), householdId)

    const items = await repository.createMealPlanItems({
      plannedFor: '2026-08-25',
      mealSlot: 'breakfast',
      selections: [
        { batchId: cubeRow.id, quantity: 1 },
        { batchId: '20000000-0000-4000-8000-000000000002', quantity: 2 },
      ],
    })

    expect(rpc).toHaveBeenCalledWith('create_meal_plan_selection', {
      p_planned_for: '2026-08-25',
      p_meal_slot: 'breakfast',
      p_selections: [
        { batch_id: cubeRow.id, quantity: 1 },
        { batch_id: '20000000-0000-4000-8000-000000000002', quantity: 2 },
      ],
    })
    expect(items[0]).toMatchObject({ cubeName: cubeRow.name, mealSlot: 'breakfast' })
  })

  it('먹은 날짜·반응·메모를 수정 RPC에 전달한다', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...consumptionRow, consumed_at: '2026-08-22T14:30:00.000Z', reaction: 'liked' },
      error: null,
    })
    const repository = new SupabaseCubeRepository(asClient({ rpc }), householdId)

    const updated = await repository.updateConsumptionRecord(consumptionRow.id, {
      consumedAt: '2026-08-22T14:30:00.000Z',
      reaction: 'liked',
      reactionNote: ' 잘 먹었어요 ',
    })

    expect(rpc).toHaveBeenCalledWith('update_consumption_record', {
      p_record_id: consumptionRow.id,
      p_consumed_at: '2026-08-22T14:30:00.000Z',
      p_reaction: 'liked',
      p_note: '잘 먹었어요',
    })
    expect(updated).toMatchObject({ reaction: 'liked', consumedAt: '2026-08-22T14:30:00.000Z' })
  })

  it('먹은 기록 시간 일괄 수정 RPC에 기록 ID와 시간을 전달한다', async () => {
    const secondRow = {
      ...consumptionRow,
      id: '30000000-0000-4000-8000-000000000002',
      consumed_at: '2026-08-24T01:26:00.000Z',
    }
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { ...consumptionRow, consumed_at: '2026-08-24T01:26:00.000Z' },
        secondRow,
      ],
      error: null,
    })
    const repository = new SupabaseCubeRepository(asClient({ rpc }), householdId)

    const updated = await repository.updateConsumptionRecordsTime(
      [consumptionRow.id, secondRow.id],
      '10:26',
    )

    expect(rpc).toHaveBeenCalledWith('update_consumption_records_time', {
      p_record_ids: [consumptionRow.id, secondRow.id],
      p_time: '10:26',
    })
    expect(updated).toHaveLength(2)
    expect(updated.every((record) => record.consumedAt === '2026-08-24T01:26:00.000Z')).toBe(true)
  })

  it('과거 먹은 기록 삭제 결과의 재고 복원 여부를 매핑한다', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { batch: { ...cubeRow, quantity: 5 }, stock_restored: true },
      error: null,
    })
    const repository = new SupabaseCubeRepository(asClient({ rpc }), householdId)

    const result = await repository.deleteConsumptionRecord(consumptionRow.id)

    expect(rpc).toHaveBeenCalledWith('delete_consumption_record', {
      p_record_id: consumptionRow.id,
    })
    expect(result.stockRestored).toBe(true)
    expect(result.batch?.quantity).toBe(5)
  })

  it('가구 행에서 아기 프로필을 읽어 앱 필드로 매핑한다', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        baby_birth_date: '2026-01-15',
        weaning_started_on: '2026-07-15',
      },
      error: null,
    })
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const repository = new SupabaseCubeRepository(asClient({ from }), householdId)

    await expect(repository.getBabyProfile()).resolves.toEqual({
      birthDate: '2026-01-15',
      weaningStartedOn: '2026-07-15',
    })
    expect(from).toHaveBeenCalledWith('households')
    expect(select).toHaveBeenCalledWith('baby_birth_date, weaning_started_on')
    expect(eq).toHaveBeenCalledWith('id', householdId)
  })

  it('검증한 아기 프로필을 가구 날짜 컬럼에만 저장한다', async () => {
    const row = {
      baby_birth_date: '2026-01-15',
      weaning_started_on: '2026-07-15',
    }
    const single = vi.fn().mockResolvedValue({ data: row, error: null })
    const selectAfterUpdate = vi.fn(() => ({ single }))
    const eq = vi.fn(() => ({ select: selectAfterUpdate }))
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    const repository = new SupabaseCubeRepository(asClient({ from }), householdId)

    await expect(
      repository.updateBabyProfile({
        birthDate: row.baby_birth_date,
        weaningStartedOn: row.weaning_started_on,
      }),
    ).resolves.toEqual({
      birthDate: row.baby_birth_date,
      weaningStartedOn: row.weaning_started_on,
    })
    expect(update).toHaveBeenCalledWith(row)
    expect(eq).toHaveBeenCalledWith('id', householdId)
    expect(selectAfterUpdate).toHaveBeenCalledWith(
      'baby_birth_date, weaning_started_on',
    )
  })

  it.each([
    {
      profile: { birthDate: '2026-02-30', weaningStartedOn: null },
      message: 'YYYY-MM-DD',
    },
    {
      profile: { birthDate: null, weaningStartedOn: '2026-13-01' },
      message: 'YYYY-MM-DD',
    },
    {
      profile: { birthDate: '2999-01-01', weaningStartedOn: null },
      message: '오늘 이후',
    },
    {
      profile: { birthDate: '2026-01-15', weaningStartedOn: '2026-01-14' },
      message: '생년월일보다 이를 수 없어요',
    },
  ])('잘못된 아기 프로필은 Supabase 호출 전에 거부한다', async ({ profile, message }) => {
    const from = vi.fn()
    const repository = new SupabaseCubeRepository(asClient({ from }), householdId)

    await expect(repository.updateBabyProfile(profile)).rejects.toThrow(message)
    expect(from).not.toHaveBeenCalled()
  })

  it('가구 프로필 변경도 Realtime 구독에 포함한다', () => {
    const on = vi.fn()
    const subscribe = vi.fn()
    const channel = { on, subscribe }
    on.mockReturnValue(channel)
    subscribe.mockReturnValue(channel)
    const removeChannel = vi.fn()
    const client = asClient({
      channel: vi.fn(() => channel),
      removeChannel,
    })
    const repository = new SupabaseCubeRepository(client, householdId)

    const unsubscribe = repository.subscribe(vi.fn())

    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'households',
        filter: `id=eq.${householdId}`,
      },
      expect.any(Function),
    )
    unsubscribe()
    expect(removeChannel).toHaveBeenCalledWith(channel)
  })
})
