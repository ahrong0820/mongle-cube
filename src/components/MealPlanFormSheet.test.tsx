import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CubeBatch } from '../types'
import { MealPlanFormSheet, type MealPlanFormSheetProps } from './MealPlanFormSheet'

function makeBatch(
  id: string,
  name: string,
  category: CubeBatch['category'],
  quantity: number,
): CubeBatch {
  return {
    id,
    householdId: 'local',
    name,
    category,
    preparedAt: '2026-08-24T01:00:00.000Z',
    expiresAt: '2026-09-07T01:00:00.000Z',
    quantity,
    unitAmount: 20,
    unit: 'g',
    memo: '',
    createdAt: '2026-08-24T01:00:00.000Z',
    updatedAt: '2026-08-24T01:00:00.000Z',
  }
}

const batches = [
  makeBatch('batch-rice', '쌀죽', 'base', 8),
  makeBatch('batch-beef', '소고기', 'topping', 5),
  makeBatch('batch-pumpkin', '애호박', 'topping', 4),
]

function renderSheet(overrides: Partial<MealPlanFormSheetProps> = {}) {
  const props: MealPlanFormSheetProps = {
    open: true,
    batches,
    initialDate: '2026-08-25',
    initialMealSlot: 'breakfast',
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return { props, ...render(<MealPlanFormSheet {...props} />) }
}

describe('식단 추가 시트', () => {
  it('여러 종류를 선택하고 종류별 수량을 한 번에 저장한다', async () => {
    const user = userEvent.setup()
    const { props } = renderSheet()

    await user.click(screen.getByRole('button', { name: '쌀죽 선택' }))
    await user.click(screen.getByRole('button', { name: '소고기 선택' }))
    await user.click(screen.getByRole('button', { name: '소고기 계획 개수 1개 늘리기' }))

    expect(screen.getByLabelText('쌀죽 계획할 개수')).toHaveValue(1)
    expect(screen.getByLabelText('소고기 계획할 개수')).toHaveValue(2)
    await user.click(screen.getByRole('button', { name: '2종 · 총 3개 계획하기' }))

    await waitFor(() =>
      expect(props.onSave).toHaveBeenCalledWith({
        plannedFor: '2026-08-25',
        mealSlot: 'breakfast',
        selections: [
          { batchId: 'batch-rice', quantity: 1 },
          { batchId: 'batch-beef', quantity: 2 },
        ],
      }),
    )
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('선택이 없으면 저장하지 않고 안내한다', async () => {
    const user = userEvent.setup()
    const { props } = renderSheet()

    await user.click(screen.getByRole('button', { name: '큐브를 골라 주세요' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      '식단에 담을 큐브를 하나 이상 골라 주세요.',
    )
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('한 끼 합계를 12개로 제한하면서 종류별 수량은 독립적으로 유지한다', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole('button', { name: '쌀죽 선택' }))
    await user.click(screen.getByRole('button', { name: '소고기 선택' }))
    const riceQuantity = screen.getByLabelText('쌀죽 계획할 개수')
    await user.clear(riceQuantity)
    await user.type(riceQuantity, '11')

    expect(riceQuantity).toHaveValue(11)
    expect(screen.getByLabelText('소고기 계획할 개수')).toHaveValue(1)
    expect(screen.getByRole('button', { name: '쌀죽 계획 개수 1개 늘리기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '소고기 계획 개수 1개 늘리기' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '애호박 선택' }))
    expect(screen.getByRole('button', { name: '애호박 선택' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      '한 끼에는 큐브를 총 12개까지 계획할 수 있어요.',
    )
  })

  it('재고보다 많이 고른 행만 부족 상태를 표시한다', async () => {
    const user = userEvent.setup()
    renderSheet({
      batches: [
        makeBatch('batch-rice', '쌀죽', 'base', 1),
        makeBatch('batch-beef', '소고기', 'topping', 5),
      ],
    })

    await user.click(screen.getByRole('button', { name: '쌀죽 선택' }))
    await user.click(screen.getByRole('button', { name: '소고기 선택' }))
    await user.click(screen.getByRole('button', { name: '쌀죽 계획 개수 1개 늘리기' }))

    const warning = screen.getByRole('status')
    expect(warning).toHaveTextContent('현재 재고보다 1개 많아요.')
    expect(warning.closest('.meal-plan-cube-option')).toHaveClass('is-short')
    expect(
      within(screen.getByRole('button', { name: '소고기 선택 해제' })).queryByText(/부족/),
    ).not.toBeInTheDocument()
  })

  it('시트를 닫았다 다시 열면 이전 선택과 수량을 초기화한다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <MealPlanFormSheet
        batches={batches}
        initialDate="2026-08-25"
        initialMealSlot="lunch"
        onClose={onClose}
        onSave={onSave}
        open
      />,
    )

    await user.click(screen.getByRole('button', { name: '쌀죽 선택' }))
    await user.click(screen.getByRole('button', { name: '쌀죽 계획 개수 1개 늘리기' }))
    expect(screen.getByLabelText('쌀죽 계획할 개수')).toHaveValue(2)

    rerender(
      <MealPlanFormSheet
        batches={batches}
        initialDate="2026-08-25"
        initialMealSlot="lunch"
        onClose={onClose}
        onSave={onSave}
        open={false}
      />,
    )
    rerender(
      <MealPlanFormSheet
        batches={batches}
        initialDate="2026-08-25"
        initialMealSlot="lunch"
        onClose={onClose}
        onSave={onSave}
        open
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '쌀죽 선택' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    )
    expect(screen.queryByLabelText('쌀죽 계획할 개수')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '큐브를 골라 주세요' })).toBeInTheDocument()
  })
})
