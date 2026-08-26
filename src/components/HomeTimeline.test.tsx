import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeTimeline } from './HomeTimeline'

describe('메인 아기 타임라인', () => {
  it('가구 이름을 날짜 칩보다 먼저 표시한다', () => {
    const { container } = render(
      <HomeTimeline
        dateKey="2026-08-25"
        profile={{
          babyName: '하준',
          displayName: '하준이네',
          birthDate: '2026-03-09',
          weaningStartedOn: '2026-08-16',
        }}
      />,
    )

    expect([...container.querySelectorAll('.home-timeline-chip')].map((chip) => chip.textContent)).toEqual([
      '하준이네',
      '이유식 10일차',
      'D+170일',
    ])
  })

  it('날짜 정보가 없어도 가구 이름은 표시한다', () => {
    render(
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

    expect(screen.getByText('하준이네')).toBeInTheDocument()
  })

  it('가구 이름과 설정한 날짜가 모두 없으면 타임라인 칩을 표시하지 않는다', () => {
    const { container } = render(
      <HomeTimeline
        dateKey="2026-08-25"
        profile={{ birthDate: null, weaningStartedOn: null }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
