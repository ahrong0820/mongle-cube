import { describe, expect, it } from 'vitest'
import type { ConsumptionRecord } from '../types'
import { groupConsumptionRecordsForDisplay } from './consumptionHistoryGroups'

function record(
  id: string,
  cubeName: string,
  consumedAt: string,
  unitAmount = 20,
  unit: ConsumptionRecord['unit'] = 'g',
): ConsumptionRecord {
  return {
    id,
    householdId: 'local',
    batchId: `batch-${id}`,
    cubeName,
    unitAmount,
    unit,
    consumedAt,
    createdAt: consumedAt,
    cancelledAt: null,
    planItemId: null,
    reaction: null,
    reactionNote: '',
  }
}

describe('먹은 기록 표시 그룹', () => {
  it('같은 날짜·분·큐브·중량이면 한 줄로 합친다', () => {
    const groups = groupConsumptionRecordsForDisplay([
      record('a', '쌀죽', '2026-10-06T01:26:05.000Z', 30),
      record('b', '쌀죽', '2026-10-06T01:26:48.000Z', 30),
      record('c', '소고기', '2026-10-06T01:26:50.000Z', 10),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].cubeName).toBe('쌀죽')
    expect(groups[0].time).toBe('10:26')
    expect(groups[0].records.map((item) => item.id)).toEqual(['a', 'b'])
    expect(groups[1].records).toHaveLength(1)
  })

  it('같은 큐브라도 표시 시간이 다르면 합치지 않는다', () => {
    const groups = groupConsumptionRecordsForDisplay([
      record('a', '쌀죽', '2026-10-06T01:26:30.000Z', 30),
      record('b', '쌀죽', '2026-10-06T01:27:00.000Z', 30),
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.time)).toEqual(['10:26', '10:27'])
  })

  it('같은 시간·이름이어도 1개당 중량이나 단위가 다르면 합치지 않는다', () => {
    const groups = groupConsumptionRecordsForDisplay([
      record('a', '쌀죽', '2026-10-06T01:26:05.000Z', 30, 'g'),
      record('b', '쌀죽', '2026-10-06T01:26:15.000Z', 40, 'g'),
      record('c', '쌀죽', '2026-10-06T01:26:25.000Z', 30, 'mL'),
    ])

    expect(groups).toHaveLength(3)
  })
})
