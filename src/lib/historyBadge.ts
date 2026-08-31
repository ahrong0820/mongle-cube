const STORAGE_KEY = 'mongle-cube:seen-consumption-record-ids:v1'

interface RecordIdentity {
  id: string
  cancelledAt: string | null
}

export function readSeenConsumptionRecordIds(storage: Pick<Storage, 'getItem'> = window.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return new Set<string>()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set<string>()
  }
}

export function writeSeenConsumptionRecordIds(
  seenIds: ReadonlySet<string>,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...seenIds]))
  } catch {
    // 확인 상태 저장에 실패해도 먹은 기록 화면 자체는 계속 사용할 수 있어야 합니다.
  }
}

export function markConsumptionRecordsSeen<T extends RecordIdentity>(
  records: readonly T[],
  current: ReadonlySet<string>,
) {
  const next = new Set(current)
  records.forEach((record) => {
    if (!record.cancelledAt) next.add(record.id)
  })
  return next
}

export function getUnreadConsumptionRecordCount<T extends RecordIdentity>(
  records: readonly T[],
  seenIds: ReadonlySet<string>,
) {
  return records.filter((record) => !record.cancelledAt && !seenIds.has(record.id)).length
}
