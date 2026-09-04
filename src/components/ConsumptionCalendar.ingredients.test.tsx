import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsumptionRecord, CubeBatch, Ingredient } from '../types'
import { ConsumptionCalendar } from './ConsumptionCalendar'

function batch(id: string, name: string): CubeBatch {
  return {
    id,
    householdId: 'home',
    name,
    category: 'topping',
    preparedAt: '2026-08-20T00:00:00.000Z',
    expiresAt: '2026-09-03T00:00:00.000Z',
    quantity: 5,
    unitAmount: 20,
    unit: 'g',
    memo: '',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  }
}

function record(
  id: string,
  batchId: string,
  cubeName: string,
  consumedAt: string,
  reaction: ConsumptionRecord['reaction'] = null,
): ConsumptionRecord {
  return {
    id,
    householdId: 'home',
    batchId,
    cubeName,
    unitAmount: 20,
    unit: 'g',
    consumedAt,
    createdAt: consumedAt,
    cancelledAt: null,
    planItemId: null,
    reaction,
    reactionNote: '',
  }
}

const rice: Ingredient = { id: 'ingredient-rice', name: '쌀' }
const beef: Ingredient = { id: 'ingredient-beef', name: '소고기' }
const broccoli: Ingredient = { id: 'ingredient-broccoli', name: '브로콜리' }

const common = {
  onEditProfile: () => undefined,
  onEditRecord: () => undefined,
  profile: { birthDate: null, weaningStartedOn: null },
}

describe('실제 재료 기준 NEW', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T03:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('다른 이름의 새 배치라도 같은 재료면 처음 섭취일에만 NEW로 표시한다', () => {
    const records = [
      record('rice-first', 'batch-rice-1', '쌀미음', '2026-08-23T23:00:00.000Z'),
      record('rice-second', 'batch-rice-2', '쌀죽', '2026-08-24T23:00:00.000Z'),
    ]

    render(
      <ConsumptionCalendar
        {...common}
        batches={[batch('batch-rice-1', '쌀미음'), batch('batch-rice-2', '쌀죽')]}
        recordIngredients={{ 'rice-first': [rice], 'rice-second': [rice] }}
        records={records}
      />,
    )

    const firstDay = screen.getByRole('button', { name: /^8월 24일, 1개 기록,/ })
    const secondDay = screen.getByRole('button', { name: /^8월 25일, 1개 기록,/ })

    expect(firstDay).toHaveAccessibleName(/새 음식 쌀/)
    expect(within(firstDay).getByText('NEW')).toBeInTheDocument()
    expect(secondDay).not.toHaveAccessibleName(/새 음식/)
    expect(within(secondDay).queryByText('NEW')).not.toBeInTheDocument()
  })

  it('혼합 큐브에서는 이미 먹은 재료를 제외하고 처음인 재료만 NEW로 표시한다', () => {
    const records = [
      record('beef-first', 'batch-beef', '소고기', '2026-08-23T23:00:00.000Z'),
      record(
        'mixed-record',
        'batch-mixed',
        '소고기브로콜리',
        '2026-08-24T23:00:00.000Z',
        'watch',
      ),
    ]

    render(
      <ConsumptionCalendar
        {...common}
        batches={[batch('batch-beef', '소고기'), batch('batch-mixed', '소고기브로콜리')]}
        recordIngredients={{
          'beef-first': [beef],
          'mixed-record': [beef, broccoli],
        }}
        records={records}
      />,
    )

    const mixedDay = screen.getByRole('button', { name: /^8월 25일, 1개 기록,/ })
    const newFoods = within(mixedDay.querySelector('.month-day__new-foods')!)

    expect(newFoods.getByText('브로콜리')).toBeInTheDocument()
    expect(newFoods.queryByText('소고기')).not.toBeInTheDocument()
    expect(mixedDay).toHaveAccessibleName(/새 음식 브로콜리/)
    expect(mixedDay).not.toHaveAccessibleName(/새 음식 소고기/)
    expect(mixedDay.querySelector('.month-day__category-reaction.is-watch')).toBeInTheDocument()
  })
})
