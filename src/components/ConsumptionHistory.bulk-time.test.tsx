import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConsumptionRecord } from '../types'
import { BulkConsumptionTimeSheet } from './BulkConsumptionTimeSheet'
import { ConsumptionHistory } from './ConsumptionHistory'

const records: ConsumptionRecord[] = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    householdId: '10000000-0000-4000-8000-000000000001',
    batchId: '20000000-0000-4000-8000-000000000001',
    cubeName: '청경채',
    unitAmount: 10,
    unit: 'g',
    consumedAt: '2026-09-04T01:26:00.000Z',
    createdAt: '2026-09-04T01:26:00.000Z',
    cancelledAt: null,
    planItemId: null,
    reaction: 'liked',
    reactionNote: '',
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    householdId: '10000000-0000-4000-8000-000000000001',
    batchId: '20000000-0000-4000-8000-000000000002',
    cubeName: '소고기',
    unitAmount: 10,
    unit: 'g',
    consumedAt: '2026-09-04T01:26:00.000Z',
    createdAt: '2026-09-04T01:26:01.000Z',
    cancelledAt: null,
    planItemId: null,
    reaction: 'liked',
    reactionNote: '',
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    householdId: '10000000-0000-4000-8000-000000000001',
    batchId: '20000000-0000-4000-8000-000000000003',
    cubeName: '쌀죽',
    unitAmount: 30,
    unit: 'g',
    consumedAt: '2026-09-04T08:40:00.000Z',
    createdAt: '2026-09-04T08:40:00.000Z',
    cancelledAt: null,
    planItemId: null,
    reaction: 'liked',
    reactionNote: '',
  },
  {
    id: '30000000-0000-4000-8000-000000000004',
    householdId: '10000000-0000-4000-8000-000000000001',
    batchId: '20000000-0000-4000-8000-000000000004',
    cubeName: '브로콜리',
    unitAmount: 10,
    unit: 'g',
    consumedAt: '2026-09-04T08:40:00.000Z',
    createdAt: '2026-09-04T08:40:01.000Z',
    cancelledAt: null,
    planItemId: null,
    reaction: 'liked',
    reactionNote: '',
  },
]

afterEach(() => {
  vi.useRealTimers()
})

describe('먹은 기록 시간 일괄 수정 UI', () => {
  it('같은 날짜에 기록이 여러 개면 날짜 카드에서 일괄 수정 버튼을 제공한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T03:00:00.000Z'))
    const onEditGroupTime = vi.fn()

    render(
      <ConsumptionHistory
        loading={false}
        onEditGroupTime={onEditGroupTime}
        onEditRecord={vi.fn()}
        onShowInventory={vi.fn()}
        records={records}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: '오늘 먹은 기록 4개 선택 시간 수정' }),
    )

    const [calledRecords, calledLabel] = onEditGroupTime.mock.calls[0]
    expect(calledRecords.map((record: ConsumptionRecord) => record.id)).toEqual([
      records[3].id,
      records[2].id,
      records[1].id,
      records[0].id,
    ])
    expect(calledLabel).toBe('오늘')
  })

  it('같은 시간 묶음만 골라 선택한 기록에 새 시간을 적용한다', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <BulkConsumptionTimeSheet
        dateLabel="오늘"
        onClose={onClose}
        onSave={onSave}
        open
        records={records}
      />,
    )

    expect(screen.getByText('10:26')).toBeInTheDocument()
    expect(screen.getByText('17:40')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '기록을 선택해 주세요' })).toBeDisabled()

    const groupButtons = screen.getAllByRole('button', { name: '이 시간 선택' })
    await user.click(groupButtons[1])

    expect(screen.getByLabelText('쌀죽 17:40 기록 선택')).toBeChecked()
    expect(screen.getByLabelText('브로콜리 17:40 기록 선택')).toBeChecked()
    expect(screen.getByLabelText('청경채 10:26 기록 선택')).not.toBeChecked()

    fireEvent.change(screen.getByLabelText('선택한 기록에 적용할 시간'), {
      target: { value: '18:10' },
    })
    await user.click(screen.getByRole('button', { name: '선택한 2개 변경' }))

    expect(onSave).toHaveBeenCalledWith(
      [records[2].id, records[3].id],
      '18:10',
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('묶음 선택 뒤 일부 기록만 다시 빼서 조정할 수 있다', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <BulkConsumptionTimeSheet
        dateLabel="오늘"
        onClose={vi.fn()}
        onSave={onSave}
        open
        records={records}
      />,
    )

    const groupButtons = screen.getAllByRole('button', { name: '이 시간 선택' })
    await user.click(groupButtons[0])
    await user.click(screen.getByLabelText('소고기 10:26 기록 선택'))

    expect(screen.getByLabelText('청경채 10:26 기록 선택')).toBeChecked()
    expect(screen.getByLabelText('소고기 10:26 기록 선택')).not.toBeChecked()
    expect(screen.getByRole('button', { name: '기록을 선택해 주세요' })).toBeDisabled()
  })
})
