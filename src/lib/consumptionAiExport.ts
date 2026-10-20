import type { DishData } from '../data/dishPreparationTypes'
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
  '기록종류',
  '준비한음식_실제섭취량과다를수있음',
  '한끼실제섭취량',
  '한끼섭취단위',
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
  dishData: DishData = { preparations: [], items: [] },
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
      '큐브별 섭취',
      '',
      '',
      '',
    ] as Array<string | number | null | undefined>
  })

  const separateMeals = dishData.preparations.filter((prep) =>
    prep.status === 'completed' &&
    (prep.outcome === 'partial' || prep.outcome === 'none') &&
    prep.consumedAt,
  )
  for (const prep of separateMeals) {
    const preparedItems = dishData.items.filter((item) =>
      item.preparationId === prep.id &&
      item.disposition !== 'corrected' && item.disposition !== 'discarded',
    )
    rows.push([
      getSeoulDateKey(prep.consumedAt!),
      formatHistoryTime(prep.consumedAt!),
      prep.consumedAt,
      '',
      '',
      '',
      '',
      '',
      prep.reaction ? reactionLabels[prep.reaction] : '미기록',
      prep.reactionNote,
      prep.outcome === 'partial' ? '한 끼 일부 섭취' : '한 끼 미섭취',
      preparedItems.map((item) => `${item.cubeName} ${item.preparedQuantity}개`).join(' | '),
      prep.outcome === 'none' ? 0 : prep.actualConsumedAmount,
      prep.outcome === 'none' ? 'g' : prep.actualConsumedUnit,
    ])
  }

  rows.sort((a, b) => String(a[2]).localeCompare(String(b[2])))
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
  dishData: DishData = { preparations: [], items: [] },
) {
  if (records.length === 0 && !dishData.preparations.some((prep) =>
    prep.status === 'completed' && (prep.outcome === 'partial' || prep.outcome === 'none')
  )) {
    throw new Error('다운로드할 먹은 기록이 없어요.')
  }

  const csv = buildConsumptionAiCsv(records, recordIngredients, dishData)
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
