import { getSeoulDateKey } from './date'
import type { ConsumptionRecord } from '../types'

export interface ConsumptionMealGroup {
  key: string
  startedAt: string
  endedAt: string
  records: ConsumptionRecord[]
}

const MEAL_WINDOW_MS = 60 * 60 * 1000

function sortChronologically(records: ConsumptionRecord[]) {
  return [...records].sort((a, b) => {
    const consumedDifference =
      new Date(a.consumedAt).getTime() - new Date(b.consumedAt).getTime()
    if (consumedDifference !== 0) return consumedDifference
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function groupConsumptionRecordsIntoMeals(
  records: ConsumptionRecord[],
): ConsumptionMealGroup[] {
  const groups: ConsumptionMealGroup[] = []

  for (const record of sortChronologically(records)) {
    const recordTime = new Date(record.consumedAt).getTime()
    const current = groups.at(-1)

    if (current) {
      const startTime = new Date(current.startedAt).getTime()
      const sameDate = getSeoulDateKey(current.startedAt) === getSeoulDateKey(record.consumedAt)
      if (sameDate && recordTime - startTime <= MEAL_WINDOW_MS) {
        current.records.push(record)
        current.endedAt = record.consumedAt
        continue
      }
    }

    groups.push({
      key: record.id,
      startedAt: record.consumedAt,
      endedAt: record.consumedAt,
      records: [record],
    })
  }

  return groups
}
