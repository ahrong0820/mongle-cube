import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DishData } from '../data/dishPreparationTypes'
import type { ConsumptionRecord } from '../types'
import { ConsumptionHistory } from './ConsumptionHistory'
import { BulkConsumptionTimeSheet } from './BulkConsumptionTimeSheet'
import { DishMealTimeSheet } from './DishMealTimeSheet'

const date = '2026-10-21'
const householdId = '10000000-0000-4000-8000-000000000001'
const preparationId = '40000000-0000-4000-8000-000000000001'
const preparedAt = '2026-10-21T03:00:00.000Z'
const records: ConsumptionRecord[] = [1,2].map((n) => ({
  id: `30000000-0000-4000-8000-00000000000${n}`,
  householdId, batchId: `20000000-0000-4000-8000-00000000000${n}`,
  cubeName: n === 1 ? '쌀죽' : '당근', unitAmount: 10, unit: 'g',
  consumedAt: preparedAt, createdAt: preparedAt,
  cancelledAt: null, planItemId: null,
  preparationItemId: `50000000-0000-4000-8000-00000000000${n}`,
  reaction: null, reactionNote: '',
}))

const dishData: DishData = {
  preparations: [{
    id: preparationId, householdId, servingOn: date, mealSlot: 'breakfast',
    status: 'completed', preparedAt: '2026-10-20T12:30:00.000Z',
    consumedAt: preparedAt, completedAt: preparedAt,
    outcome: 'all', actualConsumedAmount: null, actualConsumedUnit: null,
    reaction: null, reactionNote: '', updatedAt: preparedAt,
  }],
  items: [1,2].map((n) => ({
    id: `50000000-0000-4000-8000-00000000000${n}`,
    householdId, preparationId, batchId: `20000000-0000-4000-8000-00000000000${n}`,
    sourceKind: 'frozen' as const, preparedQuantity: 1,
    cubeName: n === 1 ? '쌀죽' : '당근',
    category: 'topping' as const, unitAmount: 10, unit: 'g' as const,
    disposition: 'consumed' as const, preparedAt: '2026-10-20T12:30:00.000Z',
  })),
}

afterEach(() => vi.restoreAllMocks())

describe('먹은 기록의 식기 끼니 시간 수정', () => {
  it('일괄 시간 수정에서 식기 끼니를 한 단위로 선택해 모든 원본 기록을 전달한다', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <BulkConsumptionTimeSheet
        open records={records} dishData={dishData}
        dateLabel="어제" onClose={vi.fn()} onSave={onSave}
      />,
    )
    await user.click(screen.getByRole('button', { name: /첫 번째 끼니 · 12:00 · 2개.*끼니 선택/ }))
    expect(screen.getByText(/식기 한 끼 2개 선택됨/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('선택한 기록에 적용할 시간'), {
      target: { value: '12:25' },
    })
    await user.click(screen.getByRole('button', { name: '선택한 끼니 2개 변경' }))
    expect(onSave).toHaveBeenCalledWith(records.map((record) => record.id), '12:25')
  })

  it('먹은 기록의 날짜 카드에 식기 기록 시간 수정 버튼을 노출한다', () => {
    const onEditGroupTime = vi.fn()
    render(
      <ConsumptionHistory
        loading={false} records={records} dishData={dishData}
        onShowInventory={vi.fn()} onEditRecord={vi.fn()}
        onEditGroupTime={onEditGroupTime}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /먹은 기록 2개 선택 시간 수정/ }))
    expect(onEditGroupTime).toHaveBeenCalledWith(expect.arrayContaining(records), expect.any(String))
  })

  it('일부/미섭취 끼니도 먹은 기록 탭에서 시간 수정 가능하다', () => {
    const onEditDishTime = vi.fn()
    const partialData: DishData = {
      ...dishData,
      preparations: [{ ...dishData.preparations[0], outcome: 'partial', actualConsumedAmount: 11 }],
    }
    render(
      <ConsumptionHistory
        loading={false} records={[]} dishData={partialData}
        onShowInventory={vi.fn()} onEditRecord={vi.fn()}
        onEditGroupTime={vi.fn()} onEditDishTime={onEditDishTime}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '첫 번째 끼니 먹은 시간 수정' }))
    expect(onEditDishTime).toHaveBeenCalledWith(partialData.preparations[0])
  })

  it('부분 섭취 끼니의 시간을 수정할 때 식사 날짜를 보존한다', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <DishMealTimeSheet
        preparation={{ ...dishData.preparations[0], outcome: 'partial' }}
        onClose={vi.fn()} onSave={onSave}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/같은 끼니의 먹은 기록 전체 시간이 함께 바뀝니다/)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('끼니 새 먹은 시간'), { target: { value: '12:20' } })
    await user.click(within(dialog).getByRole('button', { name: '먹은 시간 변경' }))
    expect(onSave).toHaveBeenCalledWith('12:20')
  })
})
