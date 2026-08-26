import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CancelCubeDisposalResult,
  CubeBatch,
  CubeDisposal,
  CubeDisposalResult,
} from '../types'
import type { CubeRepository } from './repository'

interface CubeRow {
  id: string
  household_id: string
  recipe_id: string | null
  name: string
  category: CubeBatch['category']
  prepared_at: string
  expires_at: string
  quantity: number
  unit_amount: number | null
  unit: CubeBatch['unit']
  memo: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface DisposalRow {
  id: string
  household_id: string
  batch_id: string
  quantity: number
  disposed_at: string
  cancelled_at: string | null
  created_at: string
}

interface SupabaseRepositoryInternals {
  client: SupabaseClient
  householdId: string
}

function mapBatch(row: CubeRow): CubeBatch {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    category: row.category,
    preparedAt: row.prepared_at,
    expiresAt: row.expires_at,
    quantity: row.quantity,
    unitAmount: row.unit_amount,
    unit: row.unit,
    memo: row.memo ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recipeId: row.recipe_id,
  }
}

function mapDisposal(row: DisposalRow): CubeDisposal {
  return {
    id: row.id,
    householdId: row.household_id,
    batchId: row.batch_id,
    quantity: row.quantity,
    disposedAt: row.disposed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  }
}

function friendlyError(error: unknown, fallback: string) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : ''

  return ['PT409', 'PT404', '22023', '42501'].includes(code)
    ? new Error(message || fallback)
    : new Error(fallback)
}

export function attachSupabaseDisposalSupport(repository: CubeRepository): CubeRepository {
  if (repository.mode !== 'shared') return repository

  // SupabaseCubeRepository keeps these as TypeScript-private instance fields.
  // This adapter intentionally avoids changing the stable repository implementation
  // while the disposal feature is introduced as an isolated capability.
  const { client, householdId } = repository as unknown as SupabaseRepositoryInternals

  repository.listDisposals = async () => {
    const { data, error } = await client
      .from('cube_disposals')
      .select('*')
      .eq('household_id', householdId)
      .is('cancelled_at', null)
      .order('disposed_at', { ascending: false })

    if (error) throw error
    return ((data ?? []) as DisposalRow[]).map(mapDisposal)
  }

  repository.discard = async (id, expectedUpdatedAt): Promise<CubeDisposalResult> => {
    const { data, error } = await client.rpc('discard_cube_batch', {
      p_batch_id: id,
      p_expected_updated_at: expectedUpdatedAt,
    })

    if (error) throw friendlyError(error, '큐브를 폐기하지 못했어요.')
    const result = data as {
      batch?: CubeRow
      disposal?: DisposalRow
      pending_plan_count?: number
    } | null
    if (!result?.batch || !result.disposal) {
      throw new Error('폐기 처리 결과를 확인하지 못했어요.')
    }

    return {
      batch: mapBatch(result.batch),
      disposal: mapDisposal(result.disposal),
      pendingPlanCount: Number(result.pending_plan_count ?? 0),
    }
  }

  repository.cancelDisposal = async (
    disposalId,
    expectedUpdatedAt,
  ): Promise<CancelCubeDisposalResult> => {
    const { data, error } = await client.rpc('cancel_cube_disposal', {
      p_disposal_id: disposalId,
      p_expected_updated_at: expectedUpdatedAt,
    })

    if (error) throw friendlyError(error, '폐기 기록을 취소하지 못했어요.')
    const result = data as { batch?: CubeRow; disposal?: DisposalRow } | null
    if (!result?.batch || !result.disposal) {
      throw new Error('폐기 취소 결과를 확인하지 못했어요.')
    }

    return {
      batch: mapBatch(result.batch),
      disposal: mapDisposal(result.disposal),
    }
  }

  return repository
}
