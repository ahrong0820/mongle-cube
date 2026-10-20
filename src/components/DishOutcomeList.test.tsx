import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DishData } from '../data/dishPreparationTypes'
import { DishOutcomeList } from './DishOutcomeList'

const dishData: DishData = {
  preparations: [{
    id: 'prepared-1', householdId: 'household-1', servingOn: '2026-10-20',
    mealSlot: 'breakfast', status: 'completed',
    preparedAt: '2026-10-19T12:00:00.000Z',
    consumedAt: '2026-10-20T01:00:00.000Z',
    completedAt: '2026-10-20T01:00:00.000Z',
    outcome: 'partial', actualConsumedAmount: 35, actualConsumedUnit: 'g',
    reaction: 'okay', reactionNote: '절반쯤 먹음',
    updatedAt: '2026-10-20T01:00:00.000Z',
  }],
  items: [{
    id: 'item-1', householdId: 'household-1',
    preparationId: 'prepared-1', batchId: 'batch-rice',
    sourceKind: 'frozen', preparedQuantity: 2, cubeName: '쌀죽',
    category: 'base', unitAmount: 30, unit: 'g',
    disposition: 'offered_partial', preparedAt: '2026-10-19T12:00:00.000Z',
  }],
}

describe('식기에 담은 한 끼의 일부 섭취 표시', () => {
  it('준비한 음식 개수와 실제 먹은 총량을 구분한다', () => {
    render(<DishOutcomeList dishData={dishData} date="2026-10-20" />)
    expect(screen.getByText('일부 먹음')).toBeInTheDocument()
    expect(screen.getByText('준비한 음식: 쌀죽 2개')).toBeInTheDocument()
    expect(screen.getByText('실제 먹은 양: 35g')).toBeInTheDocument()
    expect(screen.getByText('메모: 절반쯤 먹음')).toBeInTheDocument()
    expect(screen.queryByText('쌀죽 2개 먹었어요')).not.toBeInTheDocument()
  })

  it('지정 날짜가 다르면 다른 날의 끼니를 표시하지 않는다', () => {
    const { container } = render(<DishOutcomeList dishData={dishData} date="2026-10-19" />)
    expect(container.querySelector('.dish-outcome-summary')).toBeNull()
  })
})
