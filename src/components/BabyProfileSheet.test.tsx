import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BabyProfileSheet } from './BabyProfileSheet'

describe('아기·가족 정보 시트', () => {
  it('아이 이름, 가구 이름, 날짜를 서로 독립적으로 저장한다', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <BabyProfileSheet
        identityRequired
        onClose={vi.fn()}
        onSave={onSave}
        open
        profile={{
          babyName: '하준',
          displayName: '하준이네',
          birthDate: null,
          weaningStartedOn: null,
        }}
      />,
    )

    fireEvent.change(screen.getByLabelText('아이 이름'), { target: { value: ' 하준 ' } })
    fireEvent.change(screen.getByLabelText('가구 이름'), { target: { value: ' 준이네 ' } })
    fireEvent.change(screen.getByLabelText('아기 생일'), { target: { value: '2026-03-09' } })
    fireEvent.change(screen.getByLabelText('이유식 시작일'), {
      target: { value: '2026-08-16' },
    })
    fireEvent.click(screen.getByRole('button', { name: '정보 저장' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        babyName: '하준',
        displayName: '준이네',
        birthDate: '2026-03-09',
        weaningStartedOn: '2026-08-16',
      })
    })
  })

  it('shared 모드에서는 아이 이름과 가구 이름을 필수로 받는다', () => {
    const onSave = vi.fn()
    render(
      <BabyProfileSheet
        identityRequired
        onClose={vi.fn()}
        onSave={onSave}
        open
        profile={{ birthDate: null, weaningStartedOn: null }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '정보 저장' }))

    expect(screen.getByRole('alert')).toHaveTextContent('아이 이름을 입력해 주세요.')
    expect(onSave).not.toHaveBeenCalled()
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
    fireEvent.click(screen.getByRole('button', { name: '정보 저장' }))

    expect(screen.getByRole('alert')).toHaveTextContent('이유식 시작일은 아기 생일보다 빠를 수 없어요.')
    expect(onSave).not.toHaveBeenCalled()
  })
})
