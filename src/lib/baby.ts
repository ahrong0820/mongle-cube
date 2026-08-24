import type { BabyProfile } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

function dateKeyToUtcTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const date = new Date(time)
  const normalized = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')

  return normalized === value ? time : null
}

export function getInclusiveDayNumber(dateKey: string, startedOn: string | null) {
  if (!startedOn) return null
  const dateTime = dateKeyToUtcTime(dateKey)
  const startTime = dateKeyToUtcTime(startedOn)
  if (dateTime === null || startTime === null || dateTime < startTime) return null
  return Math.floor((dateTime - startTime) / DAY_MS) + 1
}

export function getBabyAgeDays(dateKey: string, profile: BabyProfile) {
  return getInclusiveDayNumber(dateKey, profile.birthDate)
}

export function getWeaningDay(dateKey: string, profile: BabyProfile) {
  return getInclusiveDayNumber(dateKey, profile.weaningStartedOn)
}
