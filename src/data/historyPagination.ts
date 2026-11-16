// Supabase Data API responses are capped per request. Always read complete
// consumption histories so first-food calculations cannot lose earlier links.
export const HISTORY_PAGE_SIZE = 500

export async function fetchAllHistoryPages<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: Row[] | null
    error: unknown
  }>,
  pageSize = HISTORY_PAGE_SIZE,
): Promise<Row[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('페이지 크기가 올바르지 않아요.')
  }

  const rows: Row[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}
