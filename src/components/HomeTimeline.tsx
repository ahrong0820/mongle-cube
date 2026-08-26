import { getBabyAgeDays, getWeaningDay } from '../lib/baby'
import type { BabyProfile } from '../types'

interface HomeTimelineProps {
  dateKey: string
  profile: BabyProfile
}

export function HomeTimeline({ dateKey, profile }: HomeTimelineProps) {
  const babyAge = getBabyAgeDays(dateKey, profile)
  const weaningDay = getWeaningDay(dateKey, profile)
  const displayName = profile.displayName?.trim() || null

  if (!displayName && babyAge === null && weaningDay === null) return null

  return (
    <>
      {displayName && (
        <span className="home-timeline-chip home-timeline-chip--household">{displayName}</span>
      )}
      {weaningDay !== null && (
        <span className="home-timeline-chip">이유식 {weaningDay}일차</span>
      )}
      {babyAge !== null && <span className="home-timeline-chip">D+{babyAge}일</span>}
    </>
  )
}
