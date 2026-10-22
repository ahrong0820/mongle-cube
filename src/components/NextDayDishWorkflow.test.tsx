import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CubeRepository } from '../data/repository'
import type { DishData, DishPreparation, DishPreparationItem } from '../data/dishPreparationTypes'
import type { CubeBatch } from '../types'
import { getSeoulDateKey } from '../lib/date'
import { DishPreparationPlanner } from './DishPreparationPlanner'

const today = getSeoulDateKey(new Date())
const tomorrow = getSeoulDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000))
const dayAfterTomorrow = getSeoulDateKey(new Date(Date.now() + 48 * 60 * 60 * 1000))

function preparation(id: string, servingOn: string): DishPreparation {
  return {
    id, householdId: 'h1', servingOn, mealSlot: 'breakfast', status: 'prepared',
    preparedAt: new Date().toISOString(), consumedAt: null, completedAt: null,
    outcome: null, actualConsumedAmount: null, actualConsumedUnit: null,
    reaction: null, reactionNote: '', updatedAt: new Date().toISOString(),
  }
}

function item(id: string, prepId: string): DishPreparationItem {
  return {
    id, householdId: 'h1', preparationId: prepId, batchId: 'batch-1',
    sourceKind: 'frozen', preparedQuantity: 2,
    cubeName: '당근', category: 'topping', unitAmount: 10, unit: 'g',
    disposition: 'ready', preparedAt: new Date().toISOString(),
  }
}

function renderPlanner(
  dishData: DishData = { preparations: [], items: [] },
  repository: Partial<CubeRepository> = {},
  batches: CubeBatch[] = [],
) {
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(
    <DishPreparationPlanner
      batches={batches} dishData={dishData}
      repository={repository as CubeRepository}
      loading={false} onChanged={onChanged}
    />,
  )
  return { onChanged }
}

describe('전날 식기 미리 담기 전용 화면', () => {
  it('오늘/내일 선택과 날짜 입력 없이 다음 날 식기만 준비할 수 있게 한다', () => {
    renderPlanner()
    expect(screen.queryByRole('button', { name: '오늘' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '내일' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('식기에 담을 날짜')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '먹은 기록을 기다리는 식기' })).toBeInTheDocument()
    const nextDay = screen.getByRole('region', { name: '다음 날 식기 미리 담기' })
    expect(within(nextDay).getByText(new RegExp(tomorrow))).toBeInTheDocument()
    expect(within(nextDay).getAllByRole('button', { name: '+ 냉동 큐브 담기' })).toHaveLength(4)
    expect(screen.getByText(/당일 바로 데워 먹였다면 냉동실의 큐브/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /바로 데워 먹이기/ })).not.toBeInTheDocument()
  })

  it('냉동 큐브를 담을 때는 오늘이 아니라 다음 날의 끼니로 생성한다', async () => {
    const user = userEvent.setup()
    const createDishPreparation = vi.fn().mockResolvedValue({})
    const batch: CubeBatch = {
      id: 'batch-1', householdId: 'h1', name: '당근', category: 'topping',
      preparedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      quantity: 8, unitAmount: 10, unit: 'g', memo: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    const { onChanged } = renderPlanner(undefined, { createDishPreparation }, [batch])
    const first = within(screen.getByRole('region', { name: '다음 날 식기 미리 담기' }))
      .getByText('첫 번째 끼니').closest('article')!
    await user.click(within(first).getByRole('button', { name: '+ 냉동 큐브 담기' }))
    fireEvent.change(within(first).getByLabelText('당근 식기에 담을 개수'), { target: { value: '2' } })
    await user.click(within(first).getByRole('button', { name: '식기에 담았어요 · 2개' }))
    expect(createDishPreparation).toHaveBeenCalledWith(tomorrow, 'breakfast', [{ batchId: 'batch-1', quantity: 2 }])
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('같은 끼니 슬롯이라도 기존 오늘 식기와 다음 날 식기가 함께 보이고 오늘 식기만 완료할 수 있다', async () => {
    const user = userEvent.setup()
    const completeDishPreparation = vi.fn().mockResolvedValue({})
    const current = preparation('today-prep', today)
    const next = preparation('tomorrow-prep', tomorrow)
    renderPlanner({
      preparations: [current, next],
      items: [item('today-item', current.id), item('tomorrow-item', next.id)],
    }, { completeDishPreparation })
    const waiting = screen.getByRole('region', { name: '먹은 기록을 기다리는 식기' })
    const planned = screen.getByRole('region', { name: '다음 날 식기 미리 담기' })
    const todayCard = within(waiting).getByText('첫 번째 끼니').closest('article')!
    const tomorrowCard = within(planned).getByText('첫 번째 끼니').closest('article')!
    expect(within(todayCard).getByText(/식사 예정일/)).toHaveTextContent(today)
    expect(within(tomorrowCard).getByText(/식사 예정일/)).toHaveTextContent(tomorrow)
    expect(within(todayCard).getByRole('button', { name: '먹은 기록 완료' })).toBeInTheDocument()
    expect(within(tomorrowCard).queryByRole('button', { name: '먹은 기록 완료' })).not.toBeInTheDocument()
    expect(within(todayCard).queryByRole('button', { name: '+ 냉동 큐브 담기' })).not.toBeInTheDocument()
    await user.click(within(todayCard).getByRole('button', { name: '먹은 기록 완료' }))
    const completedAt = within(todayCard).getByLabelText('실제로 먹인 시간') as HTMLInputElement
    expect(completedAt.value.slice(0,10)).toBe(today)
    await user.click(within(todayCard).getByRole('button', { name: '한 끼 기록 완료' }))
    expect(completeDishPreparation).toHaveBeenCalledWith('today-prep', expect.objectContaining({
      outcome: 'all', consumedAt: expect.any(String),
    }))
  })

  it('이전에 다른 미래 날짜로 저장한 기록은 삭제하지 않고 별도로 표시한다', () => {
    const legacy = preparation('old-legacy', dayAfterTomorrow)
    renderPlanner({ preparations: [legacy], items: [item('legacy-item',legacy.id)] })
    const archived = screen.getByRole('region', { name: '이전에 등록된 다른 날짜 식기' })
    expect(within(archived).getByText('첫 번째 끼니')).toBeInTheDocument()
    expect(within(archived).getByText(/식사 예정일/)).toHaveTextContent(dayAfterTomorrow)
    expect(within(archived).queryByRole('button', { name: '+ 냉동 큐브 담기' })).not.toBeInTheDocument()
    expect(within(archived).queryByRole('button', { name: '먹은 기록 완료' })).not.toBeInTheDocument()
  })
})
