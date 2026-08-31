import { describe, expect, it } from 'vitest'
import {
  getUnreadConsumptionRecordCount,
  markConsumptionRecordsSeen,
  readSeenConsumptionRecordIds,
  writeSeenConsumptionRecordIds,
} from './historyBadge'

const active = (id: string) => ({ id, cancelledAt: null })
const cancelled = (id: string) => ({ id, cancelledAt: '2026-08-31T00:00:00.000Z' })

describe('먹은 기록 배지', () => {
  it('아직 확인하지 않은 활성 기록만 센다', () => {
    const seen = new Set(['seen'])
    expect(
      getUnreadConsumptionRecordCount([active('seen'), active('new'), cancelled('cancelled')], seen),
    ).toBe(1)
  })

  it('먹은 기록 화면을 열면 현재 활성 기록을 모두 확인 처리한다', () => {
    const seen = markConsumptionRecordsSeen([active('one'), active('two')], new Set<string>())
    expect(getUnreadConsumptionRecordCount([active('one'), active('two')], seen)).toBe(0)
    expect(getUnreadConsumptionRecordCount([active('one'), active('two'), active('three')], seen)).toBe(1)
  })

  it('확인 상태를 이 기기의 localStorage 형식으로 저장하고 복구한다', () => {
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    }

    writeSeenConsumptionRecordIds(new Set(['one', 'two']), storage)
    expect(readSeenConsumptionRecordIds(storage)).toEqual(new Set(['one', 'two']))
  })
})
