import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IngredientTagInput } from './IngredientTagInput'

describe('들어간 재료 입력', () => {
  it('새 재료를 추가하고 중복 재료는 다시 추가하지 않는다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <IngredientTagInput names={[]} onChange={onChange} suggestions={['브로콜리']} />,
    )

    await user.type(screen.getByLabelText('들어간 재료 입력'), '브로콜리')
    await user.click(screen.getByRole('button', { name: '재료 추가' }))
    expect(onChange).toHaveBeenLastCalledWith(['브로콜리'])

    rerender(
      <IngredientTagInput names={['브로콜리']} onChange={onChange} suggestions={['브로콜리']} />,
    )
    await user.type(screen.getByLabelText('들어간 재료 입력'), '브로콜리')
    await user.click(screen.getByRole('button', { name: '재료 추가' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('선택한 재료를 칩에서 제거한다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<IngredientTagInput names={['쌀', '소고기']} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '쌀 재료 빼기' }))
    expect(onChange).toHaveBeenCalledWith(['소고기'])
  })
})
