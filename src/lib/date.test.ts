import { describe, expect, it } from 'vitest'
import type { CubeBatch } from '../types'
import {
  calculateExpiresAt,
  formatHistoryDateLabel,
  fromSeoulDateTimeInput,
  getExpiryStatus,
  getSeoulDateKey,
  sortCubeBatches,
  toSeoulDateTimeInput,
} from './date'

describe('이유식 큐브 날짜 계산', () => {
  it('서울 제작 시각에서 정확히 14일 뒤를 계산한다', () => {
    const preparedAt = fromSeoulDateTimeInput('2026-08-24T10:30')

    expect(preparedAt).toBe('2026-08-24T01:30:00.000Z')
    expect(calculateExpiresAt(preparedAt)).toBe('2026-09-07T01:30:00.000Z')
    expect(toSeoulDateTimeInput(calculateExpiresAt(preparedAt))).toBe('2026-09-07T10:30')
  })

  it('72시간 경계와 기한 시각을 일관되게 분류한다', () => {
    const now = new Date('2026-08-24T00:00:00.000Z')

    expect(getExpiryStatus('2026-08-27T00:00:00.001Z', now)).toBe('fresh')
    expect(getExpiryStatus('2026-08-27T00:00:00.000Z', now)).toBe('soon')
    expect(getExpiryStatus('2026-08-24T00:00:00.001Z', now)).toBe('soon')
    expect(getExpiryStatus('2026-08-24T00:00:00.000Z', now)).toBe('expired')
  })

  it('먹은 기록을 서울 자정 기준으로 서로 다른 날짜에 묶는다', () => {
    expect(getSeoulDateKey('2026-08-24T14:59:00.000Z')).toBe('2026-08-24')
    expect(getSeoulDateKey('2026-08-24T15:00:00.000Z')).toBe('2026-08-25')

    const now = new Date('2026-08-25T03:00:00.000Z')
    expect(formatHistoryDateLabel('2026-08-25T00:00:00.000Z', now)).toBe('오늘')
    expect(formatHistoryDateLabel('2026-08-24T00:00:00.000Z', now)).toBe('어제')
  })

  it('수량이 있는 큐브를 기한순으로 두고 빈 제작분은 뒤로 보낸다', () => {
    const makeBatch = (id: string, expiresAt: string, quantity: number): CubeBatch => ({
      id,
      householdId: 'local',
      name: id,
      category: 'topping',
      preparedAt: '2026-08-20T00:00:00.000Z',
      expiresAt,
      quantity,
      unitAmount: null,
      unit: null,
      memo: '',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    })

    const sorted = sortCubeBatches([
      makeBatch('빈 큐브', '2026-08-22T00:00:00.000Z', 0),
      makeBatch('나중', '2026-08-28T00:00:00.000Z', 2),
      makeBatch('먼저', '2026-08-25T00:00:00.000Z', 1),
    ])

    expect(sorted.map((batch) => batch.id)).toEqual(['먼저', '나중', '빈 큐브'])
  })
})
