import { getBabyAgeDays, getWeaningDay } from '../lib/baby'
import type { BabyProfile } from '../types'

interface HomeTimelineProps {
  dateKey: string
  profile: BabyProfile
}

export function HomeTimeline({ dateKey, profile }: HomeTimelineProps) {
  const babyAge = getBabyAgeDays(dateKey, profile)
  const weaningDay = getWeaningDay(dateKey, profile)

  if (babyAge === null && weaningDay === null) return null

  return (
    <>
      {babyAge !== null && <span className="home-timeline-chip">D+{babyAge}</span>}
      {weaningDay !== null && (
        <span className="home-timeline-chip">이유식 {weaningDay}일차</span>
      )}
    </>
  )
}
