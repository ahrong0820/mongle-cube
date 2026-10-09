import { describe, expect, it } from 'vitest'
import type { ConsumptionRecord } from '../types'
import { groupConsumptionRecordsIntoMeals } from './consumptionMealGroups'

function record(id: string, consumedAt: string): ConsumptionRecord {
  return {
    id,
    householdId: 'local',
    batchId: `batch-${id}`,
    cubeName: id,
    unitAmount: 10,
    unit: 'g',
    consumedAt,
    createdAt: consumedAt,
    cancelledAt: null,
    planItemId: null,
    reaction: null,
    reactionNote: '',
  }
}

describe('달력 끼니 그룹', () => {
  it('첫 기록 기준 60분 이내 기록을 같은 끼니로 묶는다', () => {
    const groups = groupConsumptionRecordsIntoMeals([
      record('third', '2026-10-09T02:10:00.000Z'),
      record('first', '2026-10-09T01:10:00.000Z'),
      record('second', '2026-10-09T01:45:00.000Z'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].records.map((item) => item.id)).toEqual(['first', 'second', 'third'])
  })

  it('연속 기록 간격이 짧아도 첫 기록에서 60분을 넘으면 새 끼니로 나눈다', () => {
    const groups = groupConsumptionRecordsIntoMeals([
      record('first', '2026-10-09T01:05:00.000Z'),
      record('second', '2026-10-09T01:40:00.000Z'),
      record('third', '2026-10-09T02:20:00.000Z'),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].records.map((item) => item.id)).toEqual(['first', 'second'])
    expect(groups[1].records.map((item) => item.id)).toEqual(['third'])
  })

  it('서울 날짜가 달라지면 60분 이내여도 다른 끼니로 나눈다', () => {
    const groups = groupConsumptionRecordsIntoMeals([
      record('late', '2026-10-08T14:50:00.000Z'),
      record('next', '2026-10-08T15:10:00.000Z'),
    ])

    expect(groups).toHaveLength(2)
  })
})
