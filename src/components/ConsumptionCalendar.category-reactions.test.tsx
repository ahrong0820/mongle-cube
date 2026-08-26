import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsumptionRecord, CubeBatch, CubeCategory, FoodReaction } from '../types'
import { ConsumptionCalendar } from './ConsumptionCalendar'

function makeBatch(id: string, name: string, category: CubeCategory): CubeBatch {
  return {
    id,
    householdId: 'household-1',
    name,
    category,
    preparedAt: '2026-08-20T00:00:00.000Z',
    expiresAt: '2026-09-03T00:00:00.000Z',
    quantity: 3,
    unitAmount: 20,
    unit: 'g',
    memo: '',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  }
}

function makeRecord(
  id: string,
  batchId: string,
  cubeName: string,
  reaction: FoodReaction,
  hour: number,
): ConsumptionRecord {
  const timestamp = `2026-08-25T${String(hour).padStart(2, '0')}:00:00.000Z`
  return {
    id,
    householdId: 'household-1',
    batchId,
    cubeName,
    unitAmount: 20,
    unit: 'g',
    consumedAt: timestamp,
    createdAt: timestamp,
    cancelledAt: null,
    planItemId: null,
    reaction,
    reactionNote: '',
  }
}

describe('달력 카테고리별 메뉴 반응 아이콘', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T03:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('메뉴명 바로 옆에는 대표 반응 심볼만 표시한다', () => {
    render(
      <ConsumptionCalendar
        batches={[
          makeBatch('base', '쌀죽', 'base'),
          makeBatch('topping', '소고기', 'topping'),
          makeBatch('snack', '사과', 'snack'),
        ]}
        onEditProfile={vi.fn()}
        onEditRecord={vi.fn()}
        profile={{ birthDate: null, weaningStartedOn: null }}
        records={[
          makeRecord('base-okay', 'base', '쌀죽', 'okay', 0),
          makeRecord('base-disliked', 'base', '쌀죽', 'disliked', 1),
          makeRecord('topping-watch', 'topping', '소고기', 'watch', 2),
          makeRecord('snack-liked', 'snack', '사과', 'liked', 3),
        ]}
      />,
    )

    const day = screen.getByRole('button', { name: /^8월 25일, 4개 기록,/ })
    const base = within(day.querySelector('.month-day__category.is-base') as HTMLElement)
    const topping = within(day.querySelector('.month-day__category.is-topping') as HTMLElement)
    const snack = within(day.querySelector('.month-day__category.is-snack') as HTMLElement)

    expect(base.getByTitle('쌀죽 · 거부')).toHaveTextContent('–')
    expect(base.queryByText('거부')).not.toBeInTheDocument()
    expect(topping.getByTitle('소고기 · 관찰 필요')).toHaveTextContent('!')
    expect(topping.queryByText('관찰')).not.toBeInTheDocument()
    expect(snack.getByTitle('사과 · 잘 먹음')).toHaveTextContent('♥')
    expect(snack.queryByText('잘')).not.toBeInTheDocument()
  })
})
