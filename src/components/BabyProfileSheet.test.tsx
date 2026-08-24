import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BabyProfileSheet } from './BabyProfileSheet'

describe('아기 날짜 정보 시트', () => {
  it('생일과 이유식 시작일을 저장한다', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <BabyProfileSheet
        onClose={vi.fn()}
        onSave={onSave}
        open
        profile={{ birthDate: null, weaningStartedOn: null }}
      />,
    )

    fireEvent.change(screen.getByLabelText('아기 생일'), { target: { value: '2026-03-09' } })
    fireEvent.change(screen.getByLabelText('이유식 시작일'), {
      target: { value: '2026-08-16' },
    })
    fireEvent.click(screen.getByRole('button', { name: '날짜 저장' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        birthDate: '2026-03-09',
        weaningStartedOn: '2026-08-16',
      })
    })
  })

  it('생일보다 빠른 이유식 시작일은 저장하지 않는다', () => {
    const onSave = vi.fn()
    render(
      <BabyProfileSheet
        onClose={vi.fn()}
        onSave={onSave}
        open
        profile={{ birthDate: null, weaningStartedOn: null }}
      />,
    )

    fireEvent.change(screen.getByLabelText('아기 생일'), { target: { value: '2026-03-09' } })
    fireEvent.change(screen.getByLabelText('이유식 시작일'), {
      target: { value: '2026-03-08' },
    })
    fireEvent.click(screen.getByRole('button', { name: '날짜 저장' }))

    expect(screen.getByRole('alert')).toHaveTextContent('이유식 시작일은 아기 생일보다 빠를 수 없어요.')
    expect(onSave).not.toHaveBeenCalled()
  })
})
