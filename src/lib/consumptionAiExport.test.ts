import { describe, expect, it } from 'vitest'
import type { ConsumptionRecord, Ingredient } from '../types'
import {
  buildConsumptionAiCsv,
  getConsumptionAiCsvFilename,
} from './consumptionAiExport'

function record(
  id: string,
  consumedAt: string,
  overrides: Partial<ConsumptionRecord> = {},
): ConsumptionRecord {
  return {
    id,
    householdId: 'local',
    batchId: `batch-${id}`,
    cubeName: '쌀죽',
    unitAmount: 30,
    unit: 'g',
    consumedAt,
    createdAt: consumedAt,
    cancelledAt: null,
    planItemId: null,
    reaction: null,
    reactionNote: '',
    ...overrides,
  }
}

describe('AI 분석용 먹은 기록 CSV', () => {
  it('원본 기록을 시간순으로 유지하고 실제 재료 snapshot과 반응을 내보낸다', () => {
    const newer = record('newer', '2026-10-06T08:40:00.000Z', {
      cubeName: '소고기죽',
      unitAmount: 20,
      reaction: 'liked',
      reactionNote: '잘 받아먹음',
    })
    const older = record('older', '2026-10-06T01:26:00.000Z', {
      reaction: 'watch',
    })
    const ingredients: Record<string, Ingredient[]> = {
      older: [
        { id: 'ingredient-rice', name: '쌀' },
        { id: 'ingredient-broccoli', name: '브로콜리' },
      ],
      newer: [
        { id: 'ingredient-rice', name: '쌀' },
        { id: 'ingredient-beef', name: '소고기' },
      ],
    }

    const csv = buildConsumptionAiCsv([newer, older], ingredients)
    const lines = csv.split('\r\n')

    expect(lines[0]).toContain('"날짜","시간","섭취시각_ISO","큐브"')
    expect(lines[1]).toContain('"2026-10-06","10:26"')
    expect(lines[1]).toContain('"쌀 | 브로콜리","관찰 필요",""')
    expect(lines[2]).toContain('"2026-10-06","17:40"')
    expect(lines[2]).toContain('"소고기죽","1","20","g","쌀 | 소고기","잘 먹음","잘 받아먹음"')
  })

  it('snapshot이 없으면 record의 ingredientNames를 사용하고 CSV 수식을 무력화한다', () => {
    const csv = buildConsumptionAiCsv(
      [
        record('legacy', '2026-10-06T01:26:00.000Z', {
          cubeName: '=위험',
          reactionNote: '+메모',
          ingredientNames: ['쌀', '단호박'],
        }),
      ],
      {},
    )

    expect(csv).toContain("\"'=위험\"")
    expect(csv).toContain('"쌀 | 단호박"')
    expect(csv).toContain("\"'+메모\"")
  })

  it('파일명 날짜는 서울 날짜를 사용한다', () => {
    expect(getConsumptionAiCsvFilename(new Date('2026-10-05T16:00:00.000Z'))).toBe(
      'mongle-cube-ai-records-2026-10-06.csv',
    )
  })
})
