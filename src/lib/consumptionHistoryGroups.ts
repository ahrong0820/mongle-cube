import { formatHistoryTime, getSeoulDateKey } from './date'
import type { ConsumptionRecord } from '../types'

export interface ConsumptionDisplayGroup {
  key: string
  dateKey: string
  time: string
  cubeName: string
  unitAmount: ConsumptionRecord['unitAmount']
  unit: ConsumptionRecord['unit']
  records: ConsumptionRecord[]
}

function normalizedCubeName(name: string) {
  return name.trim()
}

function getGroupKey(record: ConsumptionRecord) {
  const dateKey = getSeoulDateKey(record.consumedAt)
  const time = formatHistoryTime(record.consumedAt)

  return JSON.stringify([
    dateKey,
    time,
    normalizedCubeName(record.cubeName),
    record.unitAmount ?? null,
    record.unit ?? null,
  ])
}

export function groupConsumptionRecordsForDisplay(
  records: ConsumptionRecord[],
): ConsumptionDisplayGroup[] {
  const groups = new Map<string, ConsumptionDisplayGroup>()

  for (const record of records) {
    const key = getGroupKey(record)
    const existing = groups.get(key)

    if (existing) {
      existing.records.push(record)
      continue
    }

    groups.set(key, {
      key,
      dateKey: getSeoulDateKey(record.consumedAt),
      time: formatHistoryTime(record.consumedAt),
      cubeName: record.cubeName.trim(),
      unitAmount: record.unitAmount,
      unit: record.unit,
      records: [record],
    })
  }

  return [...groups.values()]
}
