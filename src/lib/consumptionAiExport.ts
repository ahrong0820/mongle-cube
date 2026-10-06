import { formatHistoryTime, getSeoulDateKey } from './date'
import type { ConsumptionRecord, FoodReaction, Ingredient } from '../types'

const reactionLabels: Record<FoodReaction, string> = {
  liked: '잘 먹음',
  okay: '보통',
  disliked: '거부',
  watch: '관찰 필요',
}

const headers = [
  '날짜',
  '시간',
  '섭취시각_ISO',
  '큐브',
  '섭취개수',
  '1개당양',
  '단위',
  '실제재료',
  '반응',
  '반응메모',
] as const

function protectSpreadsheetFormula(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function csvCell(value: string | number | null | undefined) {
  const raw = value == null ? '' : String(value)
  const safe = protectSpreadsheetFormula(raw)
  return `"${safe.replace(/"/g, '""')}"`
}

function ingredientNamesForRecord(
  record: ConsumptionRecord,
  recordIngredients: Record<string, Ingredient[]>,
) {
  const snapshot = recordIngredients[record.id]
  if (snapshot?.length) return snapshot.map((ingredient) => ingredient.name)
  return record.ingredientNames ?? []
}

function sortChronologically(records: ConsumptionRecord[]) {
  return [...records].sort((a, b) => {
    const consumedDifference =
      new Date(a.consumedAt).getTime() - new Date(b.consumedAt).getTime()
    if (consumedDifference !== 0) return consumedDifference
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function buildConsumptionAiCsv(
  records: ConsumptionRecord[],
  recordIngredients: Record<string, Ingredient[]>,
) {
  const rows = sortChronologically(records).map((record) => {
    const ingredientNames = ingredientNamesForRecord(record, recordIngredients)
    return [
      getSeoulDateKey(record.consumedAt),
      formatHistoryTime(record.consumedAt),
      record.consumedAt,
      record.cubeName,
      1,
      record.unitAmount,
      record.unit,
      ingredientNames.join(' | '),
      record.reaction ? reactionLabels[record.reaction] : '미기록',
      record.reactionNote,
    ]
  })

  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n')
}

export function getConsumptionAiCsvFilename(now = new Date()) {
  return `mongle-cube-ai-records-${getSeoulDateKey(now)}.csv`
}

export function downloadConsumptionAiCsv(
  records: ConsumptionRecord[],
  recordIngredients: Record<string, Ingredient[]>,
  now = new Date(),
) {
  if (records.length === 0) {
    throw new Error('다운로드할 먹은 기록이 없어요.')
  }

  const csv = buildConsumptionAiCsv(records, recordIngredients)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  try {
    anchor.href = url
    anchor.download = getConsumptionAiCsvFilename(now)
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}
