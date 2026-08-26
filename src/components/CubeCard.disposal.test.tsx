import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CubeBatch, CubeDisposal } from '../types'
import { CubeCard } from './CubeCard'

const batch: CubeBatch = {
  id: 'batch-1',
  householdId: 'household-1',
  name: '브로콜리',
  category: 'topping',
  preparedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: '2026-08-15T00:00:00.000Z',
  quantity: 3,
  unitAmount: 20,
  unit: 'g',
  memo: '',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const disposal: CubeDisposal = {
  id: 'disposal-1',
  householdId: 'household-1',
  batchId: 'batch-1',
  quantity: 3,
  disposedAt: '2026-08-16T00:00:00.000Z',
  cancelledAt: null,
  createdAt: '2026-08-16T00:00:00.000Z',
}

describe('큐브 폐기 카드', () => {
  it('남은 큐브에서 폐기 액션을 제공한다', () => {
    const onDiscard = vi.fn()
    render(
      <CubeCard
        batch={batch}
        onConsume={vi.fn()}
        onDiscard={onDiscard}
        onEdit={vi.fn()}
        onIncrement={vi.fn()}
        onRemake={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '남은 3개 폐기' }))
    expect(onDiscard).toHaveBeenCalledWith(batch)
  })

  it('폐기된 배치는 다 먹음과 구분하고 폐기 취소를 제공한다', () => {
    const discardedBatch = { ...batch, quantity: 0 }
    const onCancelDisposal = vi.fn()
    render(
      <CubeCard
        batch={discardedBatch}
        disposal={disposal}
        onCancelDisposal={onCancelDisposal}
        onConsume={vi.fn()}
        onEdit={vi.fn()}
        onIncrement={vi.fn()}
        onRemake={vi.fn()}
      />,
    )

    expect(screen.getAllByText('3개 폐기').length).toBeGreaterThan(0)
    expect(screen.queryByText('다 먹음')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '폐기 기록 취소 · 3개 복원' }))
    expect(onCancelDisposal).toHaveBeenCalledWith(discardedBatch, disposal)
  })
})
