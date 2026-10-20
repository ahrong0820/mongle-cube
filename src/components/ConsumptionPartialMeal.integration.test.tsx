import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DishData } from '../data/dishPreparationTypes'
import { ConsumptionCalendar } from './ConsumptionCalendar'
import { ConsumptionHistory } from './ConsumptionHistory'

const data: DishData = {
  preparations: [{
    id: 'prep-1', householdId: 'family-1', servingOn: '2026-10-20',
    mealSlot: 'breakfast', status: 'completed',
    preparedAt: '2026-10-19T12:00:00.000Z',
    consumedAt: '2026-10-20T01:00:00.000Z',
    completedAt: '2026-10-20T01:00:00.000Z',
    outcome: 'partial', actualConsumedAmount: 35, actualConsumedUnit: 'g',
    reaction: 'okay', reactionNote: '',
    updatedAt: '2026-10-20T01:00:00.000Z',
  }],
  items: [{
    id: 'item-1', householdId: 'family-1', preparationId: 'prep-1', batchId: 'batch-rice',
    sourceKind: 'frozen', preparedQuantity: 2, cubeName: '쌀죽', category: 'base',
    unitAmount: 30, unit: 'g', disposition: 'offered_partial',
    preparedAt: '2026-10-19T12:00:00.000Z',
  }],
}

afterEach(() => vi.useRealTimers())

describe('부분 섭취만 기록한 날의 가시성', () => {
  it('큐브별 섭취 기록이 없어도 달력의 해당 날짜와 상세에 끼니를 표시한다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T03:00:00.000Z'))
    render(<ConsumptionCalendar
      batches={[]}
      profile={{ birthDate: null, weaningStartedOn: null }}
      records={[]}
      dishData={data}
      onEditRecord={vi.fn()}
      onEditProfile={vi.fn()}
    />)

    expect(screen.getByText('일부 먹음')).toBeInTheDocument()
    expect(screen.getByText('실제 먹은 양: 35g')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /10월 20일, 일부 먹음·미섭취 1끼니/ })).toBeInTheDocument()
    expect(screen.queryByText('아직 먹은 기록이 없어요')).not.toBeInTheDocument()
  })

  it('큐브별 섭취 기록 0건이어도 먹은 기록에서 별도 끼니를 확인한다', () => {
    render(<ConsumptionHistory
      records={[]}
      dishData={data}
      loading={false}
      onShowInventory={vi.fn()}
      onEditRecord={vi.fn()}
      onEditGroupTime={vi.fn()}
    />)
    expect(screen.getByText('일부 먹음')).toBeInTheDocument()
    expect(screen.queryByText('아직 먹은 기록이 없어요')).not.toBeInTheDocument()
  })
})
