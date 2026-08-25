import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CubeDraft } from '../types'
import { LocalCubeRepository } from './localRepository'

const draft: CubeDraft = {
  name: '당근',
  category: 'topping',
  preparedAt: '2026-08-24T01:30:00.000Z',
  quantity: 2,
  unitAmount: 20,
  unit: 'g',
  memo: '첫 번째 큐브',
}

describe('로컬 큐브 저장소', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('등록, 수정, 재조회, 삭제를 처리한다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)

    expect(created.expiresAt).toBe('2026-09-07T01:30:00.000Z')
    expect(created.category).toBe('topping')
    expect(await new LocalCubeRepository().list()).toHaveLength(1)

    const updated = await repository.update(
      created.id,
      { ...draft, name: '단호박', category: 'base' },
      created.updatedAt,
    )
    expect(updated.name).toBe('단호박')
    expect(updated.category).toBe('base')

    await repository.remove(created.id, updated.updatedAt)
    expect(await repository.list()).toEqual([])
  })

  it('먹었어요 한 번으로 수량과 누적 기록을 함께 저장한다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create({ ...draft, quantity: 1 })
    const onChange = vi.fn()
    const unsubscribe = repository.subscribe(onChange)

    const consumed = await repository.consume(created.id, '00000000-0000-4000-8000-000000000001')
    expect(consumed.batch.quantity).toBe(0)
    expect(consumed.record.cubeName).toBe('당근')
    expect(await repository.listConsumptionRecords()).toEqual([consumed.record])
    expect(onChange).toHaveBeenCalledTimes(1)

    await expect(repository.consume(created.id)).rejects.toThrow('남은 큐브가 없어요')
    expect((await repository.list())[0].quantity).toBe(0)
    expect(await repository.listConsumptionRecords()).toHaveLength(1)

    unsubscribe()
  })

  it('같은 요청은 한 번만 차감하고 최근 기록 되돌리기는 수량도 복원한다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)
    const requestId = '00000000-0000-4000-8000-000000000002'

    const first = await repository.consume(created.id, requestId)
    const retried = await repository.consume(created.id, requestId)
    expect(retried.record.id).toBe(first.record.id)
    expect((await repository.list())[0].quantity).toBe(1)

    expect((await repository.undoConsumption(first.record.id)).quantity).toBe(2)
    expect(await repository.listConsumptionRecords()).toEqual([])
    expect((await repository.undoConsumption(first.record.id)).quantity).toBe(2)
  })

  it('가장 최근 기록부터만 되돌린다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)
    const first = await repository.consume(
      created.id,
      '00000000-0000-4000-8000-000000000003',
    )
    const second = await repository.consume(
      created.id,
      '00000000-0000-4000-8000-000000000004',
    )

    await expect(repository.undoConsumption(first.record.id)).rejects.toThrow(
      '가장 최근에 먹은 기록부터',
    )
    expect((await repository.list())[0].quantity).toBe(0)
    expect((await repository.undoConsumption(second.record.id)).quantity).toBe(1)
  })

  it('식단에 큐브를 담아도 재고는 차감하지 않는다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)

    const items = await repository.createMealPlanItems({
      plannedFor: '2026-08-24',
      mealSlot: 'lunch',
      selections: [{ batchId: created.id, quantity: 2 }],
    })

    expect(items).toHaveLength(2)
    expect(items.every((item) => item.consumptionRecordId === null)).toBe(true)
    expect((await repository.list())[0].quantity).toBe(2)
    expect(await repository.listConsumptionRecords()).toEqual([])
  })

  it('서로 다른 큐브를 한 끼에 함께 담고 잘못된 선택은 전부 저장하지 않는다', async () => {
    const repository = new LocalCubeRepository()
    const rice = await repository.create({ ...draft, name: '쌀죽', quantity: 3 })
    const beef = await repository.create({ ...draft, name: '소고기', quantity: 4 })

    const items = await repository.createMealPlanItems({
      plannedFor: '2026-08-24',
      mealSlot: 'breakfast',
      selections: [
        { batchId: rice.id, quantity: 1 },
        { batchId: beef.id, quantity: 2 },
      ],
    })

    expect(items.map((item) => item.cubeName)).toEqual(['쌀죽', '소고기', '소고기'])
    expect((await repository.list()).map((batch) => batch.quantity).sort()).toEqual([3, 4])

    localStorage.clear()
    const atomicRepository = new LocalCubeRepository()
    const valid = await atomicRepository.create({ ...draft, name: '감자' })
    await expect(
      atomicRepository.createMealPlanItems({
        plannedFor: '2026-08-24',
        mealSlot: 'lunch',
        selections: [
          { batchId: valid.id, quantity: 1 },
          { batchId: 'missing-batch', quantity: 1 },
        ],
      }),
    ).rejects.toThrow('찾지 못했어요')
    expect(await atomicRepository.listMealPlanItems()).toEqual([])
  })

  it('식단 항목 완료는 1개만 차감하고 기록과 연결하며 재시도해도 중복 처리하지 않는다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)
    const [planItem] = await repository.createMealPlanItems({
      plannedFor: '2026-08-24',
      mealSlot: 'dinner',
      selections: [{ batchId: created.id, quantity: 1 }],
    })
    const requestId = '00000000-0000-4000-8000-000000000101'

    const completed = await repository.completeMealPlanItem(planItem.id, requestId)
    const retried = await repository.completeMealPlanItem(planItem.id, requestId)

    expect(completed.batch.quantity).toBe(1)
    expect(completed.record.planItemId).toBe(planItem.id)
    expect(completed.planItem.consumptionRecordId).toBe(completed.record.id)
    expect(retried.record.id).toBe(completed.record.id)
    expect((await repository.list())[0].quantity).toBe(1)
    expect(await repository.listConsumptionRecords()).toEqual([completed.record])
    expect((await repository.listMealPlanItems())[0].consumptionRecordId).toBe(
      completed.record.id,
    )
  })

  it('식단에서 남긴 먹은 기록을 되돌리면 재고를 복원하고 식단 연결을 해제한다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)
    const [planItem] = await repository.createMealPlanItems({
      plannedFor: '2026-08-24',
      mealSlot: 'breakfast',
      selections: [{ batchId: created.id, quantity: 1 }],
    })
    const completed = await repository.completeMealPlanItem(
      planItem.id,
      '00000000-0000-4000-8000-000000000102',
    )

    expect((await repository.undoConsumption(completed.record.id)).quantity).toBe(2)
    expect(await repository.listConsumptionRecords()).toEqual([])
    expect((await repository.listMealPlanItems())[0].consumptionRecordId).toBeNull()

    expect((await repository.undoConsumption(completed.record.id)).quantity).toBe(2)
  })

  it('재고가 0개면 식단 완료를 원자적으로 거부한다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create({ ...draft, quantity: 0 })
    const [planItem] = await repository.createMealPlanItems({
      plannedFor: '2026-08-24',
      mealSlot: 'snack',
      selections: [{ batchId: created.id, quantity: 1 }],
    })

    await expect(
      repository.completeMealPlanItem(
        planItem.id,
        '00000000-0000-4000-8000-000000000103',
      ),
    ).rejects.toThrow('남아 있지 않아요')

    expect((await repository.list())[0].quantity).toBe(0)
    expect(await repository.listConsumptionRecords()).toEqual([])
    expect((await repository.listMealPlanItems())[0].consumptionRecordId).toBeNull()
  })

  it('먹은 기록의 반응과 메모를 업데이트한다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)
    const consumed = await repository.consume(
      created.id,
      '00000000-0000-4000-8000-000000000104',
    )

    const updated = await repository.updateConsumptionReaction(
      consumed.record.id,
      'watch',
      '  입가에 조금 발적  ',
    )

    expect(updated.reaction).toBe('watch')
    expect(updated.reactionNote).toBe('입가에 조금 발적')
    expect(await repository.listConsumptionRecords()).toEqual([updated])
    expect((await repository.list())[0].quantity).toBe(1)
  })

  it('과거 먹은 기록의 시간·반응을 수정해도 재고는 바뀌지 않는다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)
    const consumed = await repository.consume(
      created.id,
      '00000000-0000-4000-8000-000000000105',
    )

    const updated = await repository.updateConsumptionRecord(consumed.record.id, {
      consumedAt: '2026-08-22T23:30:00+09:00',
      reaction: 'liked',
      reactionNote: '  잘 먹었어요  ',
    })

    expect(updated.consumedAt).toBe('2026-08-22T14:30:00.000Z')
    expect(updated.reaction).toBe('liked')
    expect(updated.reactionNote).toBe('잘 먹었어요')
    expect((await repository.list())[0].quantity).toBe(1)

    await expect(
      repository.updateConsumptionRecord(consumed.record.id, {
        consumedAt: '2999-01-01T00:00:00.000Z',
        reaction: null,
        reactionNote: '',
      }),
    ).rejects.toThrow('미래일 수 없어요')
    expect(await repository.listConsumptionRecords()).toEqual([updated])
  })

  it('최신 기록이 아니어도 선택한 기록만 삭제하고 재고를 한 번만 복원한다', async () => {
    const repository = new LocalCubeRepository()
    const carrot = await repository.create({ ...draft, name: '당근' })
    const beef = await repository.create({ ...draft, name: '소고기' })
    const first = await repository.consume(
      carrot.id,
      '00000000-0000-4000-8000-000000000106',
    )
    const second = await repository.consume(
      beef.id,
      '00000000-0000-4000-8000-000000000107',
    )

    const deleted = await repository.deleteConsumptionRecord(first.record.id)
    expect(deleted.stockRestored).toBe(true)
    expect(deleted.batch?.quantity).toBe(2)
    expect(await repository.listConsumptionRecords()).toEqual([second.record])

    const retried = await repository.deleteConsumptionRecord(first.record.id)
    expect(retried.stockRestored).toBe(false)
    expect((await repository.list()).find((batch) => batch.id === carrot.id)?.quantity).toBe(2)
  })

  it('원래 큐브가 삭제된 기록도 재고 복원 없이 안전하게 삭제한다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)
    const consumed = await repository.consume(
      created.id,
      '00000000-0000-4000-8000-000000000110',
    )
    await repository.remove(created.id, consumed.batch.updatedAt)

    await expect(repository.deleteConsumptionRecord(consumed.record.id)).resolves.toEqual({
      batch: null,
      stockRestored: false,
    })
    expect(await repository.listConsumptionRecords()).toEqual([])
  })

  it('식단에서 만든 과거 기록을 삭제하면 식단을 다시 예정 상태로 돌린다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)
    const [planItem] = await repository.createMealPlanItems({
      plannedFor: '2026-08-24',
      mealSlot: 'breakfast',
      selections: [{ batchId: created.id, quantity: 1 }],
    })
    const completed = await repository.completeMealPlanItem(
      planItem.id,
      '00000000-0000-4000-8000-000000000108',
    )
    await repository.consume(created.id, '00000000-0000-4000-8000-000000000109')

    await repository.deleteConsumptionRecord(completed.record.id)

    expect((await repository.listMealPlanItems())[0].consumptionRecordId).toBeNull()
    expect(await repository.listConsumptionRecords()).toHaveLength(1)
    expect((await repository.list())[0].quantity).toBe(1)
  })

  it.each([
    {
      label: 'v3',
      key: 'mongle-cube-state-v3',
      value: JSON.stringify({
        version: 3,
        batches: [
          {
            id: 'legacy',
            householdId: 'local',
            name: '당근',
            preparedAt: draft.preparedAt,
            expiresAt: '2026-09-07T01:30:00.000Z',
            quantity: 2,
            unitAmount: 20,
            unit: 'g',
            memo: draft.memo,
            createdAt: '2026-08-24T01:30:00.000Z',
            updatedAt: '2026-08-24T01:30:00.000Z',
          },
        ],
        consumptionRecords: [],
        mealPlanItems: [],
      }),
    },
    {
      label: 'v2',
      key: 'mongle-cube-state-v2',
      value: JSON.stringify({
        version: 2,
        batches: [
          {
            id: 'legacy',
            householdId: 'local',
            name: '당근',
            preparedAt: draft.preparedAt,
            expiresAt: '2026-09-07T01:30:00.000Z',
            quantity: 2,
            unitAmount: 20,
            unit: 'g',
            memo: draft.memo,
            createdAt: '2026-08-24T01:30:00.000Z',
            updatedAt: '2026-08-24T01:30:00.000Z',
          },
        ],
        consumptionRecords: [],
      }),
    },
    {
      label: 'v1',
      key: 'mongle-cube-batches-v1',
      value: JSON.stringify([
        {
          id: 'legacy',
          householdId: 'local',
          name: '당근',
          preparedAt: draft.preparedAt,
          expiresAt: '2026-09-07T01:30:00.000Z',
          quantity: 2,
          unitAmount: 20,
          unit: 'g',
          memo: draft.memo,
          createdAt: '2026-08-24T01:30:00.000Z',
          updatedAt: '2026-08-24T01:30:00.000Z',
        },
      ]),
    },
  ])('기존 $label 데이터에 종류와 아기 프로필 기본값을 채운다', async ({ key, value }) => {
    localStorage.setItem(key, value)

    const repository = new LocalCubeRepository()
    expect((await repository.list())[0]).toMatchObject({
      name: '당근',
      category: 'topping',
    })
    expect(await repository.listConsumptionRecords()).toEqual([])
    expect(await repository.getBabyProfile()).toEqual({
      birthDate: null,
      weaningStartedOn: null,
    })
    expect((await repository.incrementQuantity('legacy')).quantity).toBe(3)
  })

  it('아기 프로필을 v4 상태에 저장하고 새 저장소 인스턴스에서도 읽는다', async () => {
    const repository = new LocalCubeRepository()
    expect(await repository.getBabyProfile()).toEqual({
      birthDate: null,
      weaningStartedOn: null,
    })

    const profile = {
      birthDate: '2026-01-15',
      weaningStartedOn: '2026-07-15',
    }
    expect(await repository.updateBabyProfile(profile)).toEqual(profile)
    expect(await new LocalCubeRepository().getBabyProfile()).toEqual(profile)

    const stored = JSON.parse(localStorage.getItem('mongle-cube-state-v4') ?? '{}') as {
      version?: number
    }
    expect(stored.version).toBe(4)
  })

  it('아기 프로필의 날짜 형식·미래 생년월일·시작일 순서를 검증한다', async () => {
    const repository = new LocalCubeRepository()

    await expect(
      repository.updateBabyProfile({
        birthDate: '2026-02-30',
        weaningStartedOn: null,
      }),
    ).rejects.toThrow('YYYY-MM-DD')
    await expect(
      repository.updateBabyProfile({
        birthDate: '2999-01-01',
        weaningStartedOn: null,
      }),
    ).rejects.toThrow('오늘 이후')
    await expect(
      repository.updateBabyProfile({
        birthDate: '2026-01-15',
        weaningStartedOn: '2026-01-14',
      }),
    ).rejects.toThrow('생년월일보다 이를 수 없어요')

    expect(await repository.getBabyProfile()).toEqual({
      birthDate: null,
      weaningStartedOn: null,
    })
  })

  it('오래 열린 수정 창이 더 최신 재고를 덮어쓰지 못하게 한다', async () => {
    const repository = new LocalCubeRepository()
    const created = await repository.create(draft)

    await expect(
      repository.update(created.id, { ...draft, quantity: 99 }, '오래된-수정시각'),
    ).rejects.toThrow('다른 화면에서 먼저 바뀌었어요')

    expect((await repository.list())[0].quantity).toBe(2)
  })
})
