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
      screen.getByRole('button', { name: '오늘 먹은 기록 2개 시간 일괄 수정' }),
    )

    const [calledRecords, calledLabel] = onEditGroupTime.mock.calls[0]
    expect(calledRecords.map((record: ConsumptionRecord) => record.id)).toEqual([
      records[1].id,
      records[0].id,
    ])
    expect(calledLabel).toBe('오늘')
  })

  it('선택한 시간을 전체 기록에 적용하도록 저장 요청한다', async () => {
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

    fireEvent.change(screen.getByLabelText('일괄 적용할 시간'), {
      target: { value: '11:30' },
    })
    await user.click(screen.getByRole('button', { name: '2개 시간 변경' }))

    expect(onSave).toHaveBeenCalledWith('11:30')
    expect(onClose).toHaveBeenCalled()
  })
})
