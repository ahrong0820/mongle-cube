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
    const preparedMeal = screen.getByRole('region', { name: '식기에 담아 완료한 끼니 선택' })
    expect(within(preparedMeal).getByText('12:00')).toBeInTheDocument()
    expect(within(preparedMeal).getByText('첫 번째 끼니 · 2개')).toBeInTheDocument()
    expect(within(preparedMeal).getByText('쌀죽')).toBeInTheDocument()
    expect(within(preparedMeal).getByText('당근')).toBeInTheDocument()
    expect(within(preparedMeal).getAllByText('12:00 · 10g')).toHaveLength(2)
    await user.click(within(preparedMeal).getByRole('button', { name: '이 끼니 선택' }))
    expect(within(preparedMeal).getByLabelText('첫 번째 끼니 쌀죽 1번째 · 끼니 전체 선택')).toBeChecked()
    expect(within(preparedMeal).getByLabelText('첫 번째 끼니 당근 2번째 · 끼니 전체 선택')).toBeChecked()
    expect(screen.getByText(/식기 한 끼 2개 선택됨/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('선택한 기록에 적용할 시간'), {
      target: { value: '12:25' },
    })
    await user.click(screen.getByRole('button', { name: '선택한 끼니 2개 변경' }))
    expect(onSave).toHaveBeenCalledWith(records.map((record) => record.id), '12:25')
  })

  it('큐브 6개를 일반 기록과 같은 목록으로 보여주고 하나를 눌러도 끼니 전체를 선택·해제한다', async () => {
    const user = userEvent.setup()
    const sixRecords = Array.from({ length: 6 }, (_, index) => ({
      ...records[0],
      id: `30000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, '0')}`,
      preparationItemId: `50000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, '0')}`,
      cubeName: `큐브 ${index + 1}`,
    }))
    const sixItems = sixRecords.map((record, index) => ({
      ...dishData.items[0],
      id: record.preparationItemId!,
      cubeName: record.cubeName,
      batchId: `20000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, '0')}`,
    }))
    const onSave = vi.fn().mockResolvedValue(undefined)

    render(
      <BulkConsumptionTimeSheet
        open records={sixRecords}
        dishData={{ ...dishData, items: sixItems }}
        dateLabel="어제" onClose={vi.fn()} onSave={onSave}
      />,
    )

    const mealList = screen.getByRole('region', { name: '식기에 담아 완료한 끼니 선택' })
    expect(within(mealList).getAllByRole('checkbox')).toHaveLength(6)
    expect(within(mealList).getByText('첫 번째 끼니 · 6개')).toBeInTheDocument()
    expect(within(mealList).getByText('큐브 1')).toBeInTheDocument()
    expect(within(mealList).getByText('큐브 6')).toBeInTheDocument()

    await user.click(within(mealList).getByLabelText('첫 번째 끼니 큐브 3 3번째 · 끼니 전체 선택'))
    expect(within(mealList).getAllByRole('checkbox').every((input) => (input as HTMLInputElement).checked)).toBe(true)
    expect(within(mealList).getByRole('button', { name: '이 끼니 해제' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(mealList).getByLabelText('첫 번째 끼니 큐브 3 3번째 · 끼니 전체 선택'))
    expect(within(mealList).getAllByRole('checkbox').every((input) => !(input as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByRole('button', { name: '기록을 선택해 주세요' })).toBeDisabled()

    await user.click(within(mealList).getByRole('button', { name: '이 끼니 선택' }))
    fireEvent.change(screen.getByLabelText('선택한 기록에 적용할 시간'), {
      target: { value: '12:25' },
    })
    await user.click(screen.getByRole('button', { name: '선택한 끼니 6개 변경' }))
    expect(onSave).toHaveBeenCalledWith(sixRecords.map((record) => record.id), '12:25')
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
