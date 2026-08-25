import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ConsumptionRecord } from '../types'
import { ConsumptionHistory } from './ConsumptionHistory'

function makeRecord(
  id: string,
  cubeName: string,
  consumedAt: string,
): ConsumptionRecord {
  return {
    id,
    householdId: 'local',
    batchId: `batch-${id}`,
    cubeName,
    unitAmount: 20,
    unit: 'g',
    consumedAt,
    createdAt: consumedAt,
    cancelledAt: null,
    planItemId: null,
    reaction: null,
    reactionNote: '',
  }
}

describe('먹은 기록 목록', () => {
  it('최근 기록만이 아니라 모든 과거 기록에서 수정·삭제 화면으로 진입한다', async () => {
    const user = userEvent.setup()
    const newest = makeRecord('newest', '당근', '2026-08-25T01:30:00.000Z')
    const middle = makeRecord('middle', '소고기', '2026-08-24T00:40:00.000Z')
    const oldest = makeRecord('oldest', '브로콜리', '2026-08-23T00:10:00.000Z')
    const onEditRecord = vi.fn()

    render(
      <ConsumptionHistory
        loading={false}
        onEditRecord={onEditRecord}
        onShowInventory={vi.fn()}
        records={[middle, oldest, newest]}
      />,
    )

    const expectedRecords = [newest, middle, oldest]
    for (const record of expectedRecords) {
      const name = screen.getByText(record.cubeName, { selector: '.log-row__name strong' })
      const row = name.closest('li')

      expect(row).not.toBeNull()
      const manageButton = within(row as HTMLLIElement).getByRole('button', {
        name: new RegExp(`^${record.cubeName} .* 먹은 기록 수정 또는 삭제$`),
      })
      expect(manageButton).toHaveTextContent('기록 수정·삭제')
      await user.click(manageButton)
    }

    expect(onEditRecord.mock.calls.map(([record]) => record.id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ])
  })
})
