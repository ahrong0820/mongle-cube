import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CubeRepository } from '../data/repository'
import type { DishData } from '../data/dishPreparationTypes'
import { fromSeoulDateTimeInput, getSeoulDateKey } from '../lib/date'
import { DishPreparationPlanner } from './DishPreparationPlanner'

const yesterday = getSeoulDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000))
const today = getSeoulDateKey(new Date())

function preparedYesterday(): DishData {
  return {
    preparations: [{
      id: 'prep-yesterday', householdId: 'household-1', servingOn: yesterday,
      mealSlot: 'breakfast', status: 'prepared',
      preparedAt: fromSeoulDateTimeInput(`${yesterday}T21:30`),
      consumedAt: null, completedAt: null, outcome: null,
      actualConsumedAmount: null, actualConsumedUnit: null,
      reaction: null, reactionNote: '', updatedAt: new Date().toISOString(),
    }],
    items: [{
      id: 'dish-item', householdId: 'household-1', preparationId: 'prep-yesterday',
      batchId: 'batch-1', sourceKind: 'frozen', preparedQuantity: 2,
      cubeName: '쌀죽', category: 'base', unitAmount: 30, unit: 'g',
      disposition: 'ready', preparedAt: fromSeoulDateTimeInput(`${yesterday}T21:30`),
    }],
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('어젯밤 식기 날짜 정정', () => {
  it('오늘 화면에서 이전 날짜 식기를 재고 차감 없이 날짜만 정정한다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const correctDishServingDate = vi.fn().mockResolvedValue({})
    const onChanged = vi.fn().mockResolvedValue(undefined)
    const createDishPreparation = vi.fn()
    render(
      <DishPreparationPlanner
        batches={[]}
        dishData={preparedYesterday()}
        repository={{ correctDishServingDate, createDishPreparation } as unknown as CubeRepository}
        loading={false}
        onChanged={onChanged}
      />,
    )
    expect(screen.getByText('어제 날짜로 저장된 미완료 식기가 있어요.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '오늘 식사로 날짜 정정' }))
    expect(correctDishServingDate).toHaveBeenCalledWith('prep-yesterday', today)
    expect(createDishPreparation).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('과거 날짜 끼니는 섭취 시각을 현재 시각으로 자동 입력하지 않는다', async () => {
    const user = userEvent.setup()
    render(
      <DishPreparationPlanner
        batches={[]}
        dishData={preparedYesterday()}
        repository={{ completeDishPreparation: vi.fn() } as unknown as CubeRepository}
        loading={false}
        onChanged={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    const waitingSection = screen.getByRole('region', { name: '먹은 기록을 기다리는 식기' })
    const card = within(waitingSection).getByText('첫 번째 끼니').closest('article')!
    await user.click(within(card).getByRole('button', { name: '먹은 기록 완료' }))
    const timeInput = within(card).getByLabelText('실제로 먹인 시간') as HTMLInputElement
    expect(timeInput.value).toBe('')
    expect(within(card).getByText(/이 식기의 식사 날짜는/)).toBeInTheDocument()
  })
})
