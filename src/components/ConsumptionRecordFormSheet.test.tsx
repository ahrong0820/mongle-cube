import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsumptionRecord } from '../types'
import { ConsumptionRecordFormSheet } from './ConsumptionRecordFormSheet'

function makeRecord(overrides: Partial<ConsumptionRecord> = {}): ConsumptionRecord {
  return {
    id: 'record-1',
    householdId: 'household-1',
    batchId: 'batch-1',
    cubeName: '당근',
    unitAmount: 20,
    unit: 'g',
    consumedAt: '2026-08-24T15:05:00.000Z',
    createdAt: '2026-08-24T15:05:00.000Z',
    cancelledAt: null,
    planItemId: null,
    reaction: 'okay',
    reactionNote: '천천히 먹음',
    ...overrides,
  }
}

function renderSheet(
  record = makeRecord(),
  overrides: Partial<React.ComponentProps<typeof ConsumptionRecordFormSheet>> = {},
) {
  const props = {
    onClose: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onSave: vi.fn().mockResolvedValue(undefined),
    open: true,
    record,
    ...overrides,
  }
  render(<ConsumptionRecordFormSheet {...props} />)
  return props
}

describe('먹은 기록 수정 시트', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-25T03:34:56.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('음식과 1개 수량은 고정으로 보여 주고 서울 기준 기존 값을 채운다', () => {
    renderSheet()

    const fixedFood = screen.getByRole('region', {
      name: '먹은 음식과 수량, 수정할 수 없음',
    })
    expect(fixedFood).toHaveTextContent('당근')
    expect(fixedFood).toHaveTextContent('1개 · 20g')
    expect(fixedFood).toHaveTextContent('음식과 수량은 바꿀 수 없어요.')
    expect(screen.getByLabelText('먹은 날짜와 시간, 서울 기준')).toHaveValue(
      '2026-08-25T00:05',
    )
    expect(screen.getByText('한국 시간(서울)을 기준으로 저장해요.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /보통이에요/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByLabelText('반응 메모')).toHaveValue('천천히 먹음')
  })

  it('서울 기준 일시와 반응, 다듬은 메모를 저장한다', async () => {
    const props = renderSheet()

    fireEvent.change(screen.getByLabelText('먹은 날짜와 시간, 서울 기준'), {
      target: { value: '2026-08-24T09:30' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /잘 먹었어요/ }))
    fireEvent.change(screen.getByLabelText('반응 메모'), {
      target: { value: '  한 그릇 잘 먹음  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }))

    await waitFor(() => {
      expect(props.onSave).toHaveBeenCalledWith({
        consumedAt: '2026-08-24T00:30:00.000Z',
        reaction: 'liked',
        reactionNote: '한 그릇 잘 먹음',
      })
    })
    expect(props.onDelete).not.toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('현재보다 미래인 먹은 시각은 저장하지 않는다', () => {
    const props = renderSheet()

    fireEvent.change(screen.getByLabelText('먹은 날짜와 시간, 서울 기준'), {
      target: { value: '2026-08-25T12:35' },
    })
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      '먹은 날짜와 시간은 현재보다 미래일 수 없어요.',
    )
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('저장 오류를 알리고 시트를 닫지 않는다', async () => {
    const props = renderSheet(makeRecord(), {
      onSave: vi.fn().mockRejectedValue(new Error('다른 기기에서 먼저 수정했어요.')),
    })

    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('다른 기기에서 먼저 수정했어요.')
    })
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '수정 저장' })).toBeEnabled()
  })

  it('두 번째 확인 전에는 삭제하지 않고 재고 복원과 식단 변경을 안내한다', async () => {
    const props = renderSheet(makeRecord({ planItemId: 'plan-1' }))

    fireEvent.click(screen.getByRole('button', { name: '당근 먹은 기록 삭제' }))

    expect(props.onDelete).not.toHaveBeenCalled()
    const confirmation = screen.getByRole('alert')
    expect(confirmation).toHaveTextContent('원래 큐브가 냉동실에 남아 있으면')
    expect(confirmation).toHaveTextContent('당근 재고 1개')
    expect(confirmation).toHaveTextContent('연결된 식단은 다시 ‘예정’으로 돌아가요.')
    expect(screen.getByRole('button', { name: '수정 저장' })).toBeDisabled()
    await waitFor(() =>
      expect(within(confirmation).getByRole('button', { name: '삭제 취소' })).toHaveFocus(),
    )

    fireEvent.click(within(confirmation).getByRole('button', { name: '기록 삭제 확인' }))

    await waitFor(() => expect(props.onDelete).toHaveBeenCalledTimes(1))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('삭제 오류를 알리고 다시 시도할 수 있게 한다', async () => {
    const props = renderSheet(makeRecord(), {
      onDelete: vi.fn().mockRejectedValue(new Error('재고가 가득 차서 복원할 수 없어요.')),
    })

    fireEvent.click(screen.getByRole('button', { name: '당근 먹은 기록 삭제' }))
    fireEvent.click(screen.getByRole('button', { name: '기록 삭제 확인' }))

    await waitFor(() =>
      expect(screen.getByText('재고가 가득 차서 복원할 수 없어요.')).toHaveAttribute(
        'role',
        'alert',
      ),
    )
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '기록 삭제 확인' })).toBeEnabled()
  })
})
