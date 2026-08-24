import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsumptionRecord, CubeBatch, CubeCategory } from '../types'
import { ConsumptionCalendar } from './ConsumptionCalendar'

const emptyProfile = { birthDate: null, weaningStartedOn: null }
const commonProps = {
  batches: [],
  onEditProfile: vi.fn(),
  profile: emptyProfile,
}

function makeRecord(overrides: Partial<ConsumptionRecord> = {}): ConsumptionRecord {
  return {
    id: 'record-1',
    householdId: 'household-1',
    batchId: 'batch-1',
    cubeName: '당근',
    unitAmount: 20,
    unit: 'g',
    consumedAt: '2026-08-25T00:00:00.000Z',
    createdAt: '2026-08-25T00:00:00.000Z',
    cancelledAt: null,
    planItemId: null,
    reaction: null,
    reactionNote: '',
    ...overrides,
  }
}

function makeBatch(
  id: string,
  name: string,
  category: CubeCategory,
): CubeBatch {
  return {
    id,
    householdId: 'household-1',
    name,
    category,
    preparedAt: '2026-08-20T00:00:00.000Z',
    expiresAt: '2026-09-03T00:00:00.000Z',
    quantity: 3,
    unitAmount: 20,
    unit: 'g',
    memo: '',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  }
}

function getCalendarDetail() {
  const heading = screen.getByRole('heading', { level: 3 })
  const detail = heading.closest('.calendar-detail')
  if (!detail) throw new Error('선택한 날짜의 상세 영역을 찾지 못했어요.')
  return detail as HTMLElement
}

describe('먹은 기록 달력', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T03:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('서울 자정 경계를 기준으로 서로 다른 날에 기록을 묶는다', () => {
    render(
      <ConsumptionCalendar
        {...commonProps}
        onEditReaction={vi.fn()}
        records={[
          makeRecord({
            id: 'before-midnight',
            cubeName: '당근',
            consumedAt: '2026-08-24T14:59:00.000Z',
            createdAt: '2026-08-24T14:59:00.000Z',
          }),
          makeRecord({
            id: 'after-midnight',
            cubeName: '브로콜리',
            consumedAt: '2026-08-24T15:00:00.000Z',
            createdAt: '2026-08-24T15:00:00.000Z',
          }),
        ]}
      />,
    )

    expect(
      within(getCalendarDetail()).getByRole('button', {
        name: '브로콜리 00:00 반응과 메모 기록',
      }),
    ).toBeInTheDocument()
    expect(
      within(getCalendarDetail()).queryByRole('button', { name: /^당근 / }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: '8월 24일, 1개 기록, 새 음식 당근' }),
    )

    expect(screen.getByRole('heading', { name: /8월 24일/ })).toBeInTheDocument()
    expect(
      within(getCalendarDetail()).getByRole('button', {
        name: '당근 23:59 반응과 메모 기록',
      }),
    ).toBeInTheDocument()
    expect(
      within(getCalendarDetail()).queryByRole('button', { name: /^브로콜리 / }),
    ).not.toBeInTheDocument()
  })

  it('현재 월 그리드를 보여 주고 날짜를 선택한다', () => {
    render(<ConsumptionCalendar {...commonProps} onEditReaction={vi.fn()} records={[]} />)

    const grid = screen.getByRole('group', { name: '2026년 8월 날짜 선택' })
    expect(within(grid).getAllByRole('button')).toHaveLength(42)
    expect(screen.getByRole('button', { name: '8월 25일, 먹은 기록 없음' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: '8월 10일, 먹은 기록 없음' }))

    expect(screen.getByRole('heading', { name: /8월 10일/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '8월 10일, 먹은 기록 없음' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('음식명과 반응을 표시하고 관찰 필요 기록을 시각·접근성 정보로 강조한다', () => {
    render(
      <ConsumptionCalendar
        {...commonProps}
        onEditReaction={vi.fn()}
        records={[
          makeRecord({ id: 'liked', reaction: 'liked' }),
          makeRecord({
            id: 'watch',
            batchId: 'batch-2',
            cubeName: '소고기',
            consumedAt: '2026-08-25T01:00:00.000Z',
            createdAt: '2026-08-25T01:00:00.000Z',
            reaction: 'watch',
            reactionNote: '입가에 조금 발적',
          }),
        ]}
      />,
    )

    const watchedDay = screen.getByRole('button', {
      name: '8월 25일, 2개 기록, 관찰 필요 기록 있음, 새 음식 당근, 소고기',
    })
    expect(watchedDay).toHaveClass('has-watch')
    expect(screen.getByLabelText('관찰 필요 1개, 잘 먹음 1개')).toBeInTheDocument()

    const detail = within(getCalendarDetail())
    expect(detail.getByRole('button', { name: /^당근 09:00/ })).toBeInTheDocument()
    expect(detail.getByRole('button', { name: /^소고기 10:00/ })).toBeInTheDocument()
    expect(detail.getAllByText('잘 먹음')).not.toHaveLength(0)
    expect(detail.getAllByText('관찰 필요')).not.toHaveLength(0)
    expect(detail.getByText('입가에 조금 발적').closest('li')).toHaveClass('has-watch')
  })

  it('이전·다음 달로 이동하고 해당 월의 1일을 선택한다', () => {
    render(<ConsumptionCalendar {...commonProps} onEditReaction={vi.fn()} records={[]} />)

    fireEvent.click(screen.getByRole('button', { name: '이전 달 보기' }))
    expect(screen.getByText('2026년 7월')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /7월 1일/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음 달 보기' }))
    expect(screen.getByText('2026년 8월')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /8월 25일/ })).toBeInTheDocument()
  })

  it('반응과 메모 수정 버튼으로 선택한 기록을 전달한다', () => {
    const onEditReaction = vi.fn()
    const record = makeRecord({ reaction: 'watch', reactionNote: '관찰 중' })
    render(
      <ConsumptionCalendar
        {...commonProps}
        onEditReaction={onEditReaction}
        records={[record]}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '당근 09:00 반응과 메모 수정',
      }),
    )

    expect(onEditReaction).toHaveBeenCalledTimes(1)
    expect(onEditReaction).toHaveBeenCalledWith(record)
  })

  it('D+, 이유식 일차와 역할별 식재료, NEW, 먹은 양을 표로 요약한다', () => {
    const onEditProfile = vi.fn()
    const records = [
      makeRecord({ cubeName: '쌀죽', unitAmount: 20 }),
      makeRecord({
        id: 'record-2',
        batchId: 'batch-2',
        cubeName: '소고기',
        consumedAt: '2026-08-25T01:00:00.000Z',
        createdAt: '2026-08-25T01:00:00.000Z',
        unitAmount: 15,
        reaction: 'watch',
      }),
      makeRecord({
        id: 'record-3',
        batchId: 'batch-3',
        cubeName: '사과',
        consumedAt: '2026-08-25T02:00:00.000Z',
        createdAt: '2026-08-25T02:00:00.000Z',
        unitAmount: 30,
        reaction: 'liked',
      }),
    ]

    render(
      <ConsumptionCalendar
        batches={[
          makeBatch('batch-1', '쌀죽', 'base'),
          makeBatch('batch-2', '소고기', 'topping'),
          makeBatch('batch-3', '사과', 'snack'),
        ]}
        onEditProfile={onEditProfile}
        onEditReaction={vi.fn()}
        profile={{ birthDate: '2026-03-09', weaningStartedOn: '2026-08-16' }}
        records={records}
      />,
    )

    expect(screen.getByText('D+170 · 이유식 10일차')).toBeInTheDocument()
    expect(screen.getByText('베이스').closest('.daily-food-sheet__row')).toHaveTextContent(
      '쌀죽 1개',
    )
    expect(screen.getByText('토핑').closest('.daily-food-sheet__row')).toHaveTextContent(
      '소고기 1개',
    )
    expect(screen.getByText('간식').closest('.daily-food-sheet__row')).toHaveTextContent(
      '사과 1개',
    )
    const newRow = within(
      screen.getByText('NEW', { selector: 'dt' }).closest('.daily-food-sheet__row')!,
    )
    expect(newRow.getByText('쌀죽')).toBeInTheDocument()
    expect(newRow.getByText('소고기')).toBeInTheDocument()
    expect(newRow.getByText('사과')).toBeInTheDocument()
    expect(newRow.getByText('관찰 필요')).toBeInTheDocument()
    expect(screen.getAllByText('3개 · 65g')).toHaveLength(2)

    const calendarDay = screen.getByRole('button', {
      name: '8월 25일, 3개 기록, 관찰 필요 기록 있음, 새 음식 쌀죽, 소고기, 사과',
    })
    expect(within(calendarDay).getByText('NEW')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '아기 날짜' }))
    expect(onEditProfile).toHaveBeenCalledTimes(1)
  })

  it('같은 큐브는 첫 섭취일에만 달력 NEW로 표시한다', () => {
    render(
      <ConsumptionCalendar
        {...commonProps}
        onEditReaction={vi.fn()}
        records={[
          makeRecord({
            id: 'first-carrot',
            consumedAt: '2026-08-23T23:00:00.000Z',
            createdAt: '2026-08-23T23:00:00.000Z',
          }),
          makeRecord({
            id: 'second-carrot',
            consumedAt: '2026-08-25T00:00:00.000Z',
            createdAt: '2026-08-25T00:00:00.000Z',
          }),
        ]}
      />,
    )

    const firstDay = screen.getByRole('button', {
      name: '8월 24일, 1개 기록, 새 음식 당근',
    })
    const secondDay = screen.getByRole('button', { name: '8월 25일, 1개 기록' })

    expect(within(firstDay).getByText('NEW')).toBeInTheDocument()
    expect(within(secondDay).queryByText('NEW')).not.toBeInTheDocument()
  })
})
