import type { CubeBatch, ExpiryStatus } from '../types'

export const HOUSEHOLD_EXPIRY_DAYS = 14
export const SOON_HOURS = 72

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const SEOUL_TIME_ZONE = 'Asia/Seoul'

const seoulInputFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SEOUL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const shortDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: SEOUL_TIME_ZONE,
  month: 'long',
  day: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: SEOUL_TIME_ZONE,
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const historyDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: SEOUL_TIME_ZONE,
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: SEOUL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function toPartMap(date: Date) {
  return Object.fromEntries(
    seoulInputFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
}

export function toSeoulDateTimeInput(isoOrDate: string | Date) {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  const parts = toPartMap(date)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function fromSeoulDateTimeInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('제작 날짜와 시간을 확인해 주세요.')
  }

  const date = new Date(`${value}:00+09:00`)
  if (Number.isNaN(date.getTime())) {
    throw new Error('제작 날짜와 시간을 확인해 주세요.')
  }

  return date.toISOString()
}

export function calculateExpiresAt(preparedAt: string) {
  const prepared = new Date(preparedAt)
  if (Number.isNaN(prepared.getTime())) {
    throw new Error('제작 날짜와 시간을 확인해 주세요.')
  }

  return new Date(prepared.getTime() + HOUSEHOLD_EXPIRY_DAYS * DAY_MS).toISOString()
}

export function getExpiryStatus(expiresAt: string, now = new Date()): ExpiryStatus {
  const remaining = new Date(expiresAt).getTime() - now.getTime()
  if (remaining <= 0) return 'expired'
  if (remaining <= SOON_HOURS * HOUR_MS) return 'soon'
  return 'fresh'
}

export function getRemainingLabel(expiresAt: string, now = new Date()) {
  const remaining = new Date(expiresAt).getTime() - now.getTime()
  if (remaining <= 0) {
    const elapsed = Math.abs(remaining)
    if (elapsed < DAY_MS) return '기한 지남'
    return `${Math.ceil(elapsed / DAY_MS)}일 지남`
  }

  if (remaining < DAY_MS) {
    return `${Math.max(1, Math.ceil(remaining / HOUR_MS))}시간 남음`
  }

  return `${Math.ceil(remaining / DAY_MS)}일 남음`
}

export function formatShortDate(iso: string) {
  return shortDateFormatter.format(new Date(iso))
}

export function formatDateTime(iso: string) {
  return dateTimeFormatter.format(new Date(iso))
}

export function getSeoulDateKey(isoOrDate: string | Date) {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  const parts = toPartMap(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function formatHistoryDateLabel(iso: string, now = new Date()) {
  const targetKey = getSeoulDateKey(iso)
  if (targetKey === getSeoulDateKey(now)) return '오늘'
  if (targetKey === getSeoulDateKey(new Date(now.getTime() - DAY_MS))) return '어제'
  return historyDateFormatter.format(new Date(iso))
}

export function formatHistoryTime(iso: string) {
  return timeFormatter.format(new Date(iso))
}

export function sortCubeBatches(batches: CubeBatch[]) {
  return [...batches].sort((a, b) => {
    const aEmpty = a.quantity === 0
    const bEmpty = b.quantity === 0
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1

    const expiryDifference = new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
    if (expiryDifference !== 0) return expiryDifference

    const preparedDifference =
      new Date(a.preparedAt).getTime() - new Date(b.preparedAt).getTime()
    if (preparedDifference !== 0) return preparedDifference

    return a.name.localeCompare(b.name, 'ko')
  })
}
