import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CubeRepository } from '../data/repository'
import { DishPreparationPlanner } from './DishPreparationPlanner'

describe('당일 제조만으로 첫 식기 준비', () => {
  it('냉동 큐브 없이도 원자적 최초 제조 RPC를 사용한다', async () => {
    const user = userEvent.setup()
    const createFreshDishPreparation = vi.fn().mockResolvedValue({})
    const onChanged = vi.fn().mockResolvedValue(undefined)
    render(
      <DishPreparationPlanner
        batches={[]}
        dishData={{ preparations: [], items: [] }}
        repository={{ createFreshDishPreparation } as unknown as CubeRepository}
        loading={false}
        onChanged={onChanged}
      />
    )
    const card = screen.getByText('첫 번째 끼니').closest('article')!
    await user.click(within(card).getByRole('button', { name: '+ 오늘 만든 큐브' }))
    await user.type(within(card).getByLabelText('바로 만든 큐브 이름'), '당근')
    await user.type(within(card).getByLabelText('바로 만든 큐브 들어간 재료'), '당근')
    await user.clear(within(card).getByLabelText('총 만든 개수'))
    await user.type(within(card).getByLabelText('총 만든 개수'), '6')
    await user.clear(within(card).getByLabelText('냉동 보관 개수'))
    await user.type(within(card).getByLabelText('냉동 보관 개수'), '5')
    await user.click(within(card).getByRole('button', { name: '만든 큐브 식기에 추가' }))
    expect(createFreshDishPreparation).toHaveBeenCalledWith(
      expect.any(String),
      'breakfast',
      expect.objectContaining({
        name: '당근',
        ingredientNames: ['당근'],
        totalMade: 6,
        toFreeze: 5,
      }),
    )
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('지원하지 않는 저장소에는 최초 제조 UI를 표시하지 않는다', () => {
    render(
      <DishPreparationPlanner
        batches={[]}
        dishData={{ preparations: [], items: [] }}
        repository={{} as CubeRepository}
        loading={false}
        onChanged={vi.fn().mockResolvedValue(undefined)}
      />
    )
    const card = screen.getByText('첫 번째 끼니').closest('article')!
    expect(within(card).queryByRole('button', { name: '+ 오늘 만든 큐브' })).not.toBeInTheDocument()
  })
})
