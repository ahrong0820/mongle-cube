import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSeoulDateKey } from '../lib/date'
import type {
  BabyProfile,
  ConsumptionRecord,
  CubeBatch,
  CubeCategory,
  CubeDraft,
  CubeUnit,
  FoodReaction,
  MealPlanDraft,
  MealPlanItem,
} from '../types'
import {
  AppConfigurationError,
  InviteRequiredError,
  type CubeRepository,
  type SyncStatus,
} from './repository'

interface CubeRow {
  id: string
  household_id: string
  name: string
  category: CubeCategory
  prepared_at: string
  expires_at: string
  quantity: number
  unit_amount: number | null
  unit: CubeUnit | null
  memo: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface BabyProfileRow {
  baby_birth_date: string | null
  weaning_started_on: string | null
}

interface ConsumptionRow {
  id: string
  household_id: string
  batch_id: string
  cube_name: string
  unit_amount: number | null
  unit: CubeUnit | null
  consumed_at: string
  created_at: string
  cancelled_at: string | null
  plan_item_id: string | null
  reaction: FoodReaction | null
  reaction_note: string | null
}

interface MealPlanRow {
  id: string
  household_id: string
  batch_id: string
  cube_name: string
  unit_amount: number | null
  unit: CubeUnit | null
  planned_for: string
  meal_slot: MealPlanItem['mealSlot']
  consumption_record_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function mapRow(row: CubeRow): CubeBatch {
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
  }
}

function mapConsumptionRow(row: ConsumptionRow): ConsumptionRecord {
  return {
    id: row.id,
    householdId: row.household_id,
    batchId: row.batch_id,
    cubeName: row.cube_name,
    unitAmount: row.unit_amount,
    unit: row.unit,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    planItemId: row.plan_item_id,
    reaction: row.reaction,
    reactionNote: row.reaction_note ?? '',
  }
}

function mapMealPlanRow(row: MealPlanRow): MealPlanItem {
  return {
    id: row.id,
    householdId: row.household_id,
    batchId: row.batch_id,
    cubeName: row.cube_name,
    unitAmount: row.unit_amount,
    unit: row.unit,
    plannedFor: row.planned_for,
    mealSlot: row.meal_slot,
    consumptionRecordId: row.consumption_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRowDraft(draft: CubeDraft) {
  return {
    name: draft.name,
    category: draft.category,
    prepared_at: draft.preparedAt,
    quantity: draft.quantity,
    unit_amount: draft.unitAmount,
    unit: draft.unit,
    memo: draft.memo || null,
  }
}

function mapBabyProfileRow(row: BabyProfileRow): BabyProfile {
  return {
    birthDate: row.baby_birth_date,
    weaningStartedOn: row.weaning_started_on,
  }
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  )
}

function validateBabyProfile(profile: BabyProfile) {
  if (profile.birthDate !== null && !isDateOnly(profile.birthDate)) {
    throw new Error('생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.')
  }
  if (profile.weaningStartedOn !== null && !isDateOnly(profile.weaningStartedOn)) {
    throw new Error('이유식 시작일은 YYYY-MM-DD 형식으로 입력해 주세요.')
  }
  if (profile.birthDate && profile.birthDate > getSeoulDateKey(new Date())) {
    throw new Error('생년월일은 오늘 이후로 설정할 수 없어요.')
  }
  if (
    profile.birthDate &&
    profile.weaningStartedOn &&
    profile.weaningStartedOn < profile.birthDate
  ) {
    throw new Error('이유식 시작일은 생년월일보다 이를 수 없어요.')
  }
}

export function consumeInviteToken() {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const token = hash.get('invite')
  const queryToken = url.searchParams.get('invite')

  if (token || queryToken) {
    hash.delete('invite')
    url.searchParams.delete('invite')
    url.hash = hash.toString() ? `#${hash.toString()}` : ''
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }

  if (!token && queryToken) {
    throw new AppConfigurationError('초대 링크 주소가 올바르지 않아요. 새 링크를 열어 주세요.')
  }

  if (token && !/^[a-f0-9]{64}$/i.test(token)) {
    throw new AppConfigurationError('초대 링크 형식이 올바르지 않아요.')
  }

  return token?.toLowerCase() ?? null
}

function toFriendlyWriteError(error: unknown, fallback: string) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : ''
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : ''

  if (code === 'PT409' || code === 'PT404') return new Error(message || fallback)
  return new Error(fallback)
}

export class SupabaseCubeRepository implements CubeRepository {
  readonly mode = 'shared' as const

  constructor(
    private readonly client: SupabaseClient,
    private readonly householdId: string,
  ) {}

  async list() {
    const { data, error } = await this.client
      .from('cube_batches')
      .select('*')
      .eq('household_id', this.householdId)
      .is('deleted_at', null)
      .order('expires_at', { ascending: true })

    if (error) throw error
    return (data as CubeRow[]).map(mapRow)
  }

  async listConsumptionRecords() {
    const { data, error } = await this.client
      .from('consumption_records')
      .select('*')
      .eq('household_id', this.householdId)
      .is('cancelled_at', null)
      .order('consumed_at', { ascending: false })

    if (error) throw error
    return (data as ConsumptionRow[]).map(mapConsumptionRow)
  }

  async listMealPlanItems() {
    const { data, error } = await this.client
      .from('meal_plan_items')
      .select('*')
      .eq('household_id', this.householdId)
      .is('deleted_at', null)
      .order('planned_for', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data as MealPlanRow[]).map(mapMealPlanRow)
  }

  async getBabyProfile() {
    const { data, error } = await this.client
      .from('households')
      .select('baby_birth_date, weaning_started_on')
      .eq('id', this.householdId)
      .single()

    if (error) throw error
    return mapBabyProfileRow(data as BabyProfileRow)
  }

  async updateBabyProfile(profile: BabyProfile) {
    validateBabyProfile(profile)

    const { data, error } = await this.client
      .from('households')
      .update({
        baby_birth_date: profile.birthDate,
        weaning_started_on: profile.weaningStartedOn,
      })
      .eq('id', this.householdId)
      .select('baby_birth_date, weaning_started_on')
      .single()

    if (error) throw error
    return mapBabyProfileRow(data as BabyProfileRow)
  }

  async create(draft: CubeDraft) {
    const { data, error } = await this.client
      .from('cube_batches')
      .insert({ household_id: this.householdId, ...toRowDraft(draft) })
      .select('*')
      .single()

    if (error) throw error
    return mapRow(data as CubeRow)
  }

  async update(id: string, draft: CubeDraft, expectedUpdatedAt: string) {
    const { data, error } = await this.client.rpc('update_cube_batch', {
      p_batch_id: id,
      p_expected_updated_at: expectedUpdatedAt,
      p_name: draft.name,
      p_category: draft.category,
      p_prepared_at: draft.preparedAt,
      p_quantity: draft.quantity,
      p_unit_amount: draft.unitAmount,
      p_unit: draft.unit,
      p_memo: draft.memo || null,
    })

    if (error) throw toFriendlyWriteError(error, '큐브 정보를 수정하지 못했어요.')
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('수정할 큐브를 찾지 못했어요.')
    return mapRow(row as CubeRow)
  }

  async consume(id: string, requestId = crypto.randomUUID()) {
    const { data, error } = await this.client.rpc('consume_cube', {
      p_batch_id: id,
      p_record_id: requestId,
    })

    if (error) throw toFriendlyWriteError(error, '먹은 기록을 남기지 못했어요.')
    const result = data as { batch?: CubeRow; record?: ConsumptionRow } | null
    if (!result?.batch || !result.record) throw new Error('먹은 기록 결과를 확인하지 못했어요.')
    return {
      batch: mapRow(result.batch),
      record: mapConsumptionRow(result.record),
    }
  }

  async createMealPlanItems(draft: MealPlanDraft) {
    const { data, error } = await this.client.rpc('create_meal_plan_items', {
      p_batch_id: draft.batchId,
      p_planned_for: draft.plannedFor,
      p_meal_slot: draft.mealSlot,
      p_quantity: draft.quantity,
    })

    if (error) throw toFriendlyWriteError(error, '식단에 큐브를 담지 못했어요.')
    return ((Array.isArray(data) ? data : data ? [data] : []) as MealPlanRow[]).map(
      mapMealPlanRow,
    )
  }

  async completeMealPlanItem(id: string, requestId = crypto.randomUUID()) {
    const { data, error } = await this.client.rpc('complete_meal_plan_item', {
      p_plan_item_id: id,
      p_record_id: requestId,
    })

    if (error) throw toFriendlyWriteError(error, '식단의 먹은 기록을 남기지 못했어요.')
    const result = data as {
      batch?: CubeRow
      record?: ConsumptionRow
      plan_item?: MealPlanRow
    } | null
    if (!result?.batch || !result.record || !result.plan_item) {
      throw new Error('식단 기록 결과를 확인하지 못했어요.')
    }
    return {
      batch: mapRow(result.batch),
      record: mapConsumptionRow(result.record),
      planItem: mapMealPlanRow(result.plan_item),
    }
  }

  async removeMealPlanItem(id: string) {
    const { data, error } = await this.client.rpc('delete_meal_plan_item', {
      p_plan_item_id: id,
    })
    if (error) throw toFriendlyWriteError(error, '식단에서 큐브를 빼지 못했어요.')
    if (!data) throw new Error('삭제할 식단 항목을 찾지 못했어요.')
  }

  async updateConsumptionReaction(
    recordId: string,
    reaction: FoodReaction | null,
    note: string,
  ) {
    const { data, error } = await this.client.rpc('update_consumption_reaction', {
      p_record_id: recordId,
      p_reaction: reaction,
      p_note: note.trim() || null,
    })
    if (error) throw toFriendlyWriteError(error, '아기 반응을 저장하지 못했어요.')
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('반응을 남길 먹은 기록을 찾지 못했어요.')
    return mapConsumptionRow(row as ConsumptionRow)
  }

  async undoConsumption(recordId: string) {
    const { data, error } = await this.client.rpc('undo_consumption', {
      p_record_id: recordId,
    })

    if (error) throw toFriendlyWriteError(error, '먹은 기록을 되돌리지 못했어요.')
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('되돌릴 먹은 기록을 찾지 못했어요.')
    return mapRow(row as CubeRow)
  }

  async incrementQuantity(id: string) {
    const { data, error } = await this.client.rpc('increment_cube_quantity', {
      p_batch_id: id,
    })

    if (error) throw toFriendlyWriteError(error, '수량을 더하지 못했어요.')
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('수량을 더할 큐브를 찾지 못했어요.')
    return mapRow(row as CubeRow)
  }

  async remove(id: string, expectedUpdatedAt: string) {
    const { data, error } = await this.client.rpc('delete_cube_batch', {
      p_batch_id: id,
      p_expected_updated_at: expectedUpdatedAt,
    })

    if (error) throw toFriendlyWriteError(error, '큐브를 삭제하지 못했어요.')
    if (!data) throw new Error('삭제할 큐브를 찾지 못했어요.')
  }

  subscribe(onChange: () => void, onStatus?: (status: SyncStatus) => void) {
    let active = true
    onStatus?.('connecting')
    const channel = this.client
      .channel(`cube-batches-${this.householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cube_batches',
          filter: `household_id=eq.${this.householdId}`,
        },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'consumption_records',
          filter: `household_id=eq.${this.householdId}`,
        },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meal_plan_items',
          filter: `household_id=eq.${this.householdId}`,
        },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'households',
          filter: `id=eq.${this.householdId}`,
        },
        () => onChange(),
      )
      .subscribe((status) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          onStatus?.('connected')
          onChange()
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          onStatus?.('disconnected')
        }
      })

    return () => {
      active = false
      void this.client.removeChannel(channel)
    }
  }
}

export async function connectSupabaseRepository(
  supabaseUrl: string,
  publishableKey: string,
) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })

  const inviteToken = consumeInviteToken()
  let {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession()

  if (sessionError) throw sessionError

  if (!session && inviteToken) {
    const { data, error } = await client.auth.signInAnonymously()
    if (error) {
      throw new AppConfigurationError(
        error.status === 429
          ? '연결 요청이 많아요. 잠시 후 다시 열어 주세요.'
          : '공유 연결용 세션을 만들지 못했어요. 네트워크를 확인해 주세요.',
      )
    }
    session = data.session
  }

  if (!session) throw new InviteRequiredError()

  const membershipResult = await client
    .from('household_members')
    .select('household_id')
    .eq('user_id', session.user.id)
    .limit(1)
    .maybeSingle()

  if (membershipResult.error) throw membershipResult.error

  let householdId = membershipResult.data?.household_id as string | undefined

  if (!householdId && inviteToken) {
    const { data, error } = await client.rpc('claim_household_invite', {
      p_token: inviteToken,
    })
    if (error) {
      if (error.code === '22023') {
        throw new AppConfigurationError('초대 링크가 올바르지 않거나 만료됐어요.')
      }
      if (error.code === '23514') {
        throw new AppConfigurationError('연결 가능한 기기 수가 모두 찼어요.')
      }
      throw new AppConfigurationError('공유 연결에 실패했어요. 네트워크를 확인해 주세요.')
    }
    householdId = data as string
  }

  if (!householdId) throw new InviteRequiredError()

  return new SupabaseCubeRepository(client, householdId)
}
