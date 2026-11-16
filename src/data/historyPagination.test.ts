import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { fetchAllHistoryPages } from './historyPagination'
import { SupabaseCubeRepository } from './supabaseRepository'

interface Row { [key: string]: unknown }

function mockClient(datasets: Record<string, Row[]>) {
  const ranges: Array<{ table: string; from: number; to: number }> = []
  const orders: Array<{ table: string; column: string }> = []

  // An unpaginated Supabase query returns at most 1,000 rows. A paginated
  // query returns exactly the requested slice from a stable dataset.
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      order: (column: string) => {
        orders.push({ table, column })
        return query
      },
      range: (start: number, end: number) => {
        ranges.push({ table, from: start, to: end })
        return Promise.resolve({
          data: (datasets[table] ?? []).slice(start, end + 1),
          error: null,
        })
      },
      then: (
        resolve: (result: { data: Row[]; error: null }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve({
        data: (datasets[table] ?? []).slice(0, 1000),
        error: null,
      }).then(resolve, reject),
    }
    return query
  })
  return {
    client: { from } as unknown as SupabaseClient,
    ranges,
    orders,
  }
}

describe('Supabase 기록 1,000행 제한 대응', () => {
  it('1,237개 재료 링크를 끝까지 읽고 마지막 아욱을 달력 모델에 연결한다', async () => {
    const links = Array.from({ length: 1237 }, (_, index) => ({
      record_id: `record-${String(index).padStart(4, '0')}`,
      ingredient_id: index === 1236 ? 'mallow' : 'brown-rice',
    }))
    const { client, ranges, orders } = mockClient({
      ingredients: [
        { id: 'brown-rice', name: '현미' },
        { id: 'mallow', name: '아욱' },
      ],
      cube_recipes: [],
      cube_recipe_ingredients: [],
      cube_batch_ingredients: [],
      consumption_record_ingredients: links,
    })

    const model = await new SupabaseCubeRepository(client, 'household-a').getIngredientModel()
    expect(Object.keys(model.recordIngredients)).toHaveLength(1237)
    expect(model.recordIngredients['record-0000']?.map((i) => i.name)).toEqual(['현미'])
    expect(model.recordIngredients['record-1236']?.map((i) => i.name)).toEqual(['아욱'])
    expect(ranges.filter(({ table }) => table === 'consumption_record_ingredients'))
      .toEqual([
        { table: 'consumption_record_ingredients', from: 0, to: 499 },
        { table: 'consumption_record_ingredients', from: 500, to: 999 },
        { table: 'consumption_record_ingredients', from: 1000, to: 1499 },
      ])
    expect(orders).toEqual(expect.arrayContaining([
      { table: 'consumption_record_ingredients', column: 'record_id' },
      { table: 'consumption_record_ingredients', column: 'ingredient_id' },
    ]))
  })

  it('먹은 기록이 1,000개를 넘어도 날짜와 ID 순서로 모두 가져온다', async () => {
    const recordRows = Array.from({ length: 1103 }, (_, index) => ({
      id: `record-${String(index).padStart(4, '0')}`,
      household_id: 'household-a',
      batch_id: 'batch-a',
      cube_name: index === 1102 ? '아욱' : '쌀죽',
      unit_amount: 10,
      unit: 'g',
      consumed_at: '2026-11-16T01:00:00Z',
      created_at: '2026-11-16T01:00:00Z',
      cancelled_at: null,
      plan_item_id: null,
      preparation_item_id: null,
      reaction: null,
      reaction_note: '',
    }))
    const { client, ranges, orders } = mockClient({ consumption_records: recordRows })
    const records = await new SupabaseCubeRepository(client, 'household-a').listConsumptionRecords()

    expect(records).toHaveLength(1103)
    expect(records.at(-1)?.cubeName).toBe('아욱')
    expect(ranges.map(({ from, to }) => [from, to]))
      .toEqual([[0, 499], [500, 999], [1000, 1499]])
    expect(orders).toEqual(expect.arrayContaining([
      { table: 'consumption_records', column: 'consumed_at' },
      { table: 'consumption_records', column: 'id' },
    ]))
  })

  it('정확히 페이지 크기일 때 빈 마지막 페이지까지 읽어 누락을 방지한다', async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => index)
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1), error: null,
    }))
    await expect(fetchAllHistoryPages(fetchPage)).resolves.toEqual(rows)
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(fetchPage).toHaveBeenLastCalledWith(1000, 1499)
  })

  it('중간 페이지 오류 시 불완전한 기록을 화면에 전달하지 않는다', async () => {
    const failure = new Error('재료 연결 조회 실패')
    const fetchPage = vi.fn(async (from: number) => ({
      data: from === 0 ? Array.from({ length: 500 }, (_, index) => index) : null,
      error: from === 0 ? null : failure,
    }))
    await expect(fetchAllHistoryPages(fetchPage)).rejects.toThrow('재료 연결 조회 실패')
  })
})
