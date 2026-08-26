import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeTimeline } from './HomeTimeline'

describe('메인 아기 타임라인', () => {
  it('이유식 일차 다음에 생후 D+를 표시한다', () => {
    const { container } = render(
      <HomeTimeline
        dateKey="2026-08-25"
        profile={{ birthDate: '2026-03-09', weaningStartedOn: '2026-08-16' }}
      />,
    )

    expect(screen.getByText('이유식 10일차')).toBeInTheDocument()
    expect(screen.getByText('D+170일')).toBeInTheDocument()
    expect([...container.querySelectorAll('.home-timeline-chip')].map((chip) => chip.textContent)).toEqual([
      '이유식 10일차',
      'D+170일',
    ])
  })

  it('설정한 날짜가 없으면 타임라인 칩을 표시하지 않는다', () => {
    const { container } = render(
      <HomeTimeline
        dateKey="2026-08-25"
        profile={{
          babyName: '하준',
          displayName: '하준이네',
          birthDate: null,
          weaningStartedOn: null,
        }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
