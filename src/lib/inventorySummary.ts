import type { CubeBatch } from '../types'
import { getExpiryStatus, getRemainingLabel } from './date'

export type InventorySummaryKind = 'empty' | 'comfortable' | 'soon' | 'expired'

export interface InventorySummary {
  kind: InventorySummaryKind
  label: string | null
  detail: string
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('ko-KR')
}

function cubeTypeKey(batch: CubeBatch) {
  if (batch.recipeId) return `recipe:${batch.recipeId}`
  return `legacy:${normalized(batch.name)}:${batch.category}`
}

function summarizePriorityGroup(candidates: CubeBatch[], now: Date) {
  const sorted = [...candidates].sort(
    (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
  )
  const remainingLabel = getRemainingLabel(sorted[0].expiresAt, now)
  const samePriority = sorted.filter(
    (batch) => getRemainingLabel(batch.expiresAt, now) === remainingLabel,
  )

  const uniqueTypes: CubeBatch[] = []
  const seen = new Set<string>()
  for (const batch of samePriority) {
    const key = cubeTypeKey(batch)
    if (seen.has(key)) continue
    seen.add(key)
    uniqueTypes.push(batch)
  }

  const firstName = uniqueTypes[0].name
  const otherCount = uniqueTypes.length - 1
  const names = otherCount > 0 ? `${firstName} 외 ${otherCount}종` : firstName
  return `${names} · ${remainingLabel}`
}

export function getInventorySummary(
  batches: CubeBatch[],
  now = new Date(),
): InventorySummary {
  const available = batches.filter((batch) => batch.quantity > 0)
  if (available.length === 0) {
    return {
      kind: 'empty',
      label: null,
      detail: '새 큐브를 담아볼까요?',
    }
  }

  const expired = available.filter((batch) => getExpiryStatus(batch.expiresAt, now) === 'expired')
  if (expired.length > 0) {
    return {
      kind: 'expired',
      label: '기한 확인',
      detail: summarizePriorityGroup(expired, now),
    }
  }

  const soon = available.filter((batch) => getExpiryStatus(batch.expiresAt, now) === 'soon')
  if (soon.length > 0) {
    return {
      kind: 'soon',
      label: '먹을 차례',
      detail: summarizePriorityGroup(soon, now),
    }
  }

  return {
    kind: 'comfortable',
    label: null,
    detail: '냉동실 모두 여유 있어요',
  }
}
