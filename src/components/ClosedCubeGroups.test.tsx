import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CubeBatch, CubeDisposal, CubeRecipe } from '../types'
import { ClosedCubeGroups } from './ClosedCubeGroups'

function makeBatch(id: string, preparedAt: string): CubeBatch {
  return {
    id,
    householdId: 'household-1',
    recipeId: 'recipe-rice',
    name: '쌀미음',
    category: 'base',
    preparedAt,
    expiresAt: '2026-08-30T00:00:00.000Z',
    quantity: 0,
    unitAmount: 20,
    unit: 'g',
    memo: '',
    createdAt: preparedAt,
    updatedAt: preparedAt,
  }
}

const recipe: CubeRecipe = {
  id: 'recipe-rice',
  householdId: 'household-1',
  name: '쌀미음',
  category: 'base',
  defaultUnitAmount: 20,
  defaultUnit: 'g',
  ingredients: [{ id: 'ingredient-rice', name: '쌀' }],
}

const disposal: CubeDisposal = {
  id: 'disposal-1',
  householdId: 'household-1',
  batchId: 'batch-2',
  quantity: 2,
  disposedAt: '2026-08-20T00:00:00.000Z',
  cancelledAt: null,
  createdAt: '2026-08-20T00:00:00.000Z',
}

describe('재고 없음 제작 이력', () => {
  it('같은 큐브 종류의 반복 제작 배치를 한 그룹으로 묶고 종료 사유를 구분한다', () => {
    render(
      <ClosedCubeGroups
        batches={[
          makeBatch('batch-1', '2026-08-01T00:00:00.000Z'),
          makeBatch('batch-2', '2026-08-15T00:00:00.000Z'),
        ]}
        disposals={[disposal]}
        onCancelDisposal={vi.fn()}
        onConsume={vi.fn()}
        onEdit={vi.fn()}
        onIncrement={vi.fn()}
        onRemake={vi.fn()}
        pendingIds={new Set()}
        recipes={[recipe]}
      />,
    )

    const groups = document.querySelectorAll('.closed-cube-group')
    expect(groups).toHaveLength(1)
    expect(groups[0].querySelector('summary')).toHaveTextContent(
      '쌀미음2번 제작 · 다 먹음 1회 · 폐기 1회',
    )
    expect(screen.getAllByText('2개 폐기').length).toBeGreaterThan(0)
  })

  it('recipe ID가 다른 제작 종류는 이름이 같아도 별도 그룹으로 유지한다', () => {
    const second = { ...makeBatch('batch-2', '2026-08-15T00:00:00.000Z'), recipeId: 'recipe-rice-2' }
    render(
      <ClosedCubeGroups
        batches={[makeBatch('batch-1', '2026-08-01T00:00:00.000Z'), second]}
        disposals={[]}
        onCancelDisposal={vi.fn()}
        onConsume={vi.fn()}
        onEdit={vi.fn()}
        onIncrement={vi.fn()}
        onRemake={vi.fn()}
        pendingIds={new Set()}
        recipes={[recipe, { ...recipe, id: 'recipe-rice-2' }]}
      />,
    )

    expect(document.querySelectorAll('.closed-cube-group')).toHaveLength(2)
  })
})
