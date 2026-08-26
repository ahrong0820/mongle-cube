import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { getSeoulDateKey } from './lib/date'

async function addIngredient(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText('들어간 재료 입력'), name)
  await user.click(screen.getByRole('button', { name: '재료 추가' }))
}

describe('몽글큐브 핵심 흐름', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('첫 큐브를 등록하고 먹은 기록을 누적한 뒤 개별 삭제한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '첫 큐브 등록' }))
    await user.type(screen.getByLabelText(/큐브 이름/), '당근')
    await addIngredient(user, '당근')
    await user.click(screen.getByRole('button', { name: '큐브 저장' }))

    expect(await screen.findByRole('heading', { name: '당근' })).toBeInTheDocument()
    expect(screen.getByLabelText('남은 수량 1개')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '당근 1개 먹은 기록 남기기' }))
    await waitFor(() => expect(screen.getByLabelText('남은 수량 0개')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '당근 1개 먹은 기록 남기기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '당근 다시 만들기' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '먹은 기록' }))
    expect(await screen.findByRole('heading', { name: '지금까지 1개 먹었어요' })).toBeInTheDocument()
    expect(screen.getByText('당근', { selector: '.log-row__name strong' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /당근 .* 먹은 기록 수정 또는 삭제/ }))
    await user.click(screen.getByRole('button', { name: '당근 먹은 기록 삭제' }))
    await user.click(screen.getByRole('button', { name: '기록 삭제 확인' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '지금까지 0개 먹었어요' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: '냉동실' }))
    expect(await screen.findByLabelText('남은 수량 1개')).toBeInTheDocument()
  })

  it('한 식단에 여러 큐브를 계획하고 먹은 기록을 수정한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '첫 큐브 등록' }))
    await user.type(screen.getByLabelText(/큐브 이름/), '브로콜리')
    await addIngredient(user, '브로콜리')
    await user.click(screen.getByRole('button', { name: '큐브 저장' }))

    await user.click(await screen.findByRole('button', { name: '큐브 추가' }))
    await user.type(screen.getByLabelText(/큐브 이름/), '쌀죽')
    await addIngredient(user, '쌀')
    await user.click(screen.getByRole('button', { name: '베이스' }))
    await user.click(screen.getByRole('button', { name: '큐브 저장' }))

    await user.click(await screen.findByRole('button', { name: '식단' }))
    await user.click(screen.getByRole('button', { name: '아침 식단 추가' }))
    await user.click(screen.getByRole('button', { name: '브로콜리 선택' }))
    await user.click(screen.getByRole('button', { name: '쌀죽 선택' }))
    await user.click(screen.getByRole('button', { name: '2종 · 총 2개 계획하기' }))

    const broccoli = await screen.findByText('브로콜리', { selector: '.plan-item__copy strong' })
    expect(screen.getByText('쌀죽', { selector: '.plan-item__copy strong' })).toBeInTheDocument()
    const broccoliPlan = broccoli.closest('li')
    expect(broccoliPlan).not.toBeNull()
    await user.click(within(broccoliPlan as HTMLElement).getByRole('button', { name: '먹었어요' }))

    await user.click(await screen.findByRole('button', { name: '기록 수정' }))
    await user.click(screen.getByRole('radio', { name: /잘 먹었어요/ }))
    await user.type(screen.getByLabelText('반응 메모'), '한 숟갈 더 찾았어요')
    await user.click(screen.getByRole('button', { name: '수정 저장' }))

    await user.click(screen.getByRole('button', { name: '먹은 기록' }))
    expect(await screen.findByText('잘 먹음')).toBeInTheDocument()
    expect(screen.getByText('한 숟갈 더 찾았어요')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '냉동실' }))
    expect(await screen.findByLabelText('남은 수량 0개')).toBeInTheDocument()
    expect(screen.getByLabelText('남은 수량 1개')).toBeInTheDocument()
  })

  it('메인에 아기 D+와 이유식 일차를, 달력에는 이유식 일차와 역할별 식단표를 보여 준다', async () => {
    const user = userEvent.setup()
    const today = getSeoulDateKey(new Date())
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '첫 큐브 등록' }))
    await user.type(screen.getByLabelText(/큐브 이름/), '쌀죽')
    await addIngredient(user, '쌀')
    await user.click(screen.getByRole('button', { name: '베이스' }))
    await user.click(screen.getByRole('button', { name: '큐브 저장' }))
    await user.click(await screen.findByRole('button', { name: '쌀죽 1개 먹은 기록 남기기' }))

    const navigation = screen.getByRole('navigation', { name: '주요 화면' })
    const navigationLabels = within(navigation)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(navigationLabels).toEqual(['냉동실', '달력', '식단', '먹은 기록'])

    const calendarTab = within(navigation).getByRole('button', { name: '달력' })
    await user.click(calendarTab)
    expect(calendarTab).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('heading', { name: '먹은 기록 달력' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '아기 날짜' }))
    fireEvent.change(screen.getByLabelText('아기 생일'), { target: { value: today } })
    fireEvent.change(screen.getByLabelText('이유식 시작일'), { target: { value: today } })
    await user.click(screen.getByRole('button', { name: '날짜 저장' }))

    expect(
      await screen.findByText('이유식 1일차', { selector: '.calendar-detail__timeline' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('D+1일')).not.toBeInTheDocument()
    const overview = screen.getByRole('region', { name: '먹은 내용 한눈에 보기' })
    expect(within(overview).getByText('베이스').closest('.daily-food-sheet__row')).toHaveTextContent(
      '쌀죽 1개',
    )
    expect(within(overview).getByText('NEW').closest('.daily-food-sheet__row')).toHaveTextContent(
      '쌀죽',
    )
    expect(
      screen.queryByRole('button', { name: /생일과 이유식 시작일을 설정할까요/ }),
    ).not.toBeInTheDocument()

    await user.click(within(navigation).getByRole('button', { name: '냉동실' }))
    expect(await screen.findByText('D+1일', { selector: '.home-timeline-chip' })).toBeInTheDocument()
    expect(screen.getByText('이유식 1일차', { selector: '.home-timeline-chip' })).toBeInTheDocument()

    await user.click(within(navigation).getByRole('button', { name: '먹은 기록' }))
    expect(await screen.findByRole('heading', { name: '지금까지 1개 먹었어요' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '먹은 기록 달력' })).not.toBeInTheDocument()
  })
})