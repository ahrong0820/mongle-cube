import { describe, expect, it } from 'vitest'
import type { CubeBatch } from '../types'
import { getInventorySummary } from './inventorySummary'

const NOW = new Date('2026-08-26T00:00:00.000Z')

function batch(
  name: string,
  expiresAt: string,
  options: { recipeId?: string; quantity?: number; category?: CubeBatch['category'] } = {},
): CubeBatch {
  return {
    id: `${name}-${expiresAt}-${options.recipeId ?? 'legacy'}`,
    householdId: 'household-1',
    recipeId: options.recipeId ?? null,
    name,
    category: options.category ?? 'topping',
    preparedAt: '2026-08-20T00:00:00.000Z',
    expiresAt,
    quantity: options.quantity ?? 1,
    unitAmount: 20,
    unit: 'g',
    memo: '',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  }
}

describe('getInventorySummary', () => {
  it('같은 2일 남음 구간의 여러 큐브 종류를 첫 이름과 외 N종으로 요약한다', () => {
    const summary = getInventorySummary(
      [
        batch('미음', '2026-08-27T06:00:00.000Z', { recipeId: 'rice' }),
        batch('소고기', '2026-08-27T11:00:00.000Z', { recipeId: 'beef' }),
        batch('브로콜리', '2026-08-27T16:00:00.000Z', { recipeId: 'broccoli' }),
        batch('미음', '2026-08-27T20:00:00.000Z', { recipeId: 'rice' }),
      ],
      NOW,
    )

    expect(summary).toEqual({
      kind: 'soon',
      label: '먹을 차례',
      detail: '미음 외 2종 · 2일 남음',
    })
  })

  it('기한이 지난 큐브가 있으면 임박 큐브보다 기한 확인을 우선한다', () => {
    const summary = getInventorySummary(
      [
        batch('당근', '2026-08-24T18:00:00.000Z', { recipeId: 'carrot' }),
        batch('소고기', '2026-08-24T22:00:00.000Z', { recipeId: 'beef' }),
        batch('미음', '2026-08-27T00:00:00.000Z', { recipeId: 'rice' }),
      ],
      NOW,
    )

    expect(summary).toEqual({
      kind: 'expired',
      label: '기한 확인',
      detail: '당근 외 1종 · 2일 지남',
    })
  })

  it('임박하거나 지난 큐브가 없으면 전체가 여유 있다고 안내한다', () => {
    expect(
      getInventorySummary(
        [batch('미음', '2026-08-30T12:00:00.000Z', { recipeId: 'rice' })],
        NOW,
      ),
    ).toEqual({
      kind: 'comfortable',
      label: null,
      detail: '냉동실 모두 여유 있어요',
    })
  })

  it('남은 재고가 없으면 새 큐브 등록을 안내한다', () => {
    expect(
      getInventorySummary(
        [batch('미음', '2026-08-30T12:00:00.000Z', { recipeId: 'rice', quantity: 0 })],
        NOW,
      ),
    ).toEqual({
      kind: 'empty',
      label: null,
      detail: '새 큐브를 담아볼까요?',
    })
  })
})
