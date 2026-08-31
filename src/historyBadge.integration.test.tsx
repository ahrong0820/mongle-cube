import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('먹은 기록 하단 배지', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('먹은 기록 메뉴를 열면 현재 알림 숫자가 사라진다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '첫 큐브 등록' }))
    await user.type(screen.getByLabelText(/큐브 이름/), '당근')
    await user.type(screen.getByLabelText('들어간 재료 입력'), '당근')
    await user.click(screen.getByRole('button', { name: '재료 추가' }))
    await user.click(screen.getByRole('button', { name: '큐브 저장' }))
    await user.click(await screen.findByRole('button', { name: '당근 1개 먹은 기록 남기기' }))

    const historyButton = screen.getByRole('button', { name: '먹은 기록' })
    expect(within(historyButton).getByText('1', { selector: 'b' })).toBeInTheDocument()

    await user.click(historyButton)
    await waitFor(() => {
      expect(within(historyButton).queryByText('1', { selector: 'b' })).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '냉동실' }))
    expect(within(historyButton).queryByText('1', { selector: 'b' })).not.toBeInTheDocument()
  })
})
