import { calculateExpiresAt, getSeoulDateKey } from '../lib/date'
import type {
  BabyProfile,
  ConsumptionRecord,
  ConsumptionRecordUpdate,
  CubeBatch,
  CubeCategory,
  CubeDraft,
  FoodReaction,
  MealPlanDraft,
  MealPlanItem,
} from '../types'
import type { CubeRepository, SyncStatus } from './repository'

const STORAGE_KEY = 'mongle-cube-state-v4'
const PREVIOUS_STORAGE_KEY = 'mongle-cube-state-v3'
const OLDER_STORAGE_KEY = 'mongle-cube-state-v2'
const LEGACY_STORAGE_KEY = 'mongle-cube-batches-v1'
const localEvents = new EventTarget()

interface LocalState {
  version: 4
  batches: CubeBatch[]
  consumptionRecords: ConsumptionRecord[]
  mealPlanItems: MealPlanItem[]
  babyProfile: BabyProfile
}

function emptyState(): LocalState {
  return {
    version: 4,
    batches: [],
    consumptionRecords: [],
    mealPlanItems: [],
    babyProfile: { birthDate: null, weaningStartedOn: null },
  }
}

type StoredCubeBatch = Omit<CubeBatch, 'category'> & { category?: unknown }

const CUBE_CATEGORIES: readonly CubeCategory[] = ['base', 'topping', 'snack', 'other']

function isCubeCategory(value: unknown): value is CubeCategory {
  return typeof value === 'string' && CUBE_CATEGORIES.includes(value as CubeCategory)
}

function normalizeBatch(batch: StoredCubeBatch): CubeBatch {
  return {
    ...batch,
    category: isCubeCategory(batch.category) ? batch.category : 'topping',
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

function normalizeBabyProfile(value: unknown): BabyProfile {
  if (!value || typeof value !== 'object') {
    return { birthDate: null, weaningStartedOn: null }
  }

  const stored = value as Partial<BabyProfile>
  const birthDate = isDateOnly(stored.birthDate) ? stored.birthDate : null
  const weaningStartedOn = isDateOnly(stored.weaningStartedOn)
    ? stored.weaningStartedOn
    : null

  return {
    birthDate,
    weaningStartedOn:
      birthDate && weaningStartedOn && weaningStartedOn < birthDate
        ? null
        : weaningStartedOn,
  }
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

function normalizeRecord(record: ConsumptionRecord): ConsumptionRecord {
  return {
    ...record,
    planItemId: record.planItemId ?? null,
    reaction: record.reaction ?? null,
    reactionNote: record.reactionNote ?? '',
  }
}

function parseState(raw: string): LocalState | null {
  const parsed = JSON.parse(raw) as Partial<LocalState>
  if (!Array.isArray(parsed.batches) || !Array.isArray(parsed.consumptionRecords)) {
    return null
  }

  return {
    version: 4,
    batches: parsed.batches.map((batch) =>
      normalizeBatch(batch as StoredCubeBatch),
    ),
    consumptionRecords: parsed.consumptionRecords.map((record) =>
      normalizeRecord(record as ConsumptionRecord),
    ),
    mealPlanItems: Array.isArray(parsed.mealPlanItems)
      ? parsed.mealPlanItems.map((item) => ({
          ...(item as MealPlanItem),
          consumptionRecordId: (item as MealPlanItem).consumptionRecordId ?? null,
        }))
      : [],
    babyProfile: normalizeBabyProfile(parsed.babyProfile),
  }
}

function readState(): LocalState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = parseState(raw)
      if (parsed) return parsed
    }

    const previousRaw = window.localStorage.getItem(PREVIOUS_STORAGE_KEY)
    if (previousRaw) {
      const parsed = parseState(previousRaw)
      if (parsed) return parsed
    }

    const olderRaw = window.localStorage.getItem(OLDER_STORAGE_KEY)
    if (olderRaw) {
      const parsed = parseState(olderRaw)
      if (parsed) return parsed
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!legacyRaw) return emptyState()
    const legacyBatches = JSON.parse(legacyRaw) as StoredCubeBatch[]
    return {
      version: 4,
      batches: Array.isArray(legacyBatches) ? legacyBatches.map(normalizeBatch) : [],
      consumptionRecords: [],
      mealPlanItems: [],
      babyProfile: { birthDate: null, weaningStartedOn: null },
    }
  } catch {
    return emptyState()
  }
}

function writeState(state: LocalState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  localEvents.dispatchEvent(new Event('change'))
}

function sortRecords(records: ConsumptionRecord[]) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
    const consumedDifference =
      new Date(b.record.consumedAt).getTime() - new Date(a.record.consumedAt).getTime()
    if (consumedDifference !== 0) return consumedDifference
    const createdDifference = b.record.createdAt.localeCompare(a.record.createdAt)
    if (createdDifference !== 0) return createdDifference
    return b.index - a.index
  })
    .map(({ record }) => record)
}

const slotOrder = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }

function sortMealPlanItems(items: MealPlanItem[]) {
  return [...items].sort((a, b) => {
    const dateDifference = a.plannedFor.localeCompare(b.plannedFor)
    if (dateDifference !== 0) return dateDifference
    const slotDifference = slotOrder[a.mealSlot] - slotOrder[b.mealSlot]
    if (slotDifference !== 0) return slotDifference
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export class LocalCubeRepository implements CubeRepository {
  readonly mode = 'local' as const

  async list() {
    return readState().batches
  }

  async listConsumptionRecords() {
    return sortRecords(readState().consumptionRecords.filter((record) => !record.cancelledAt))
  }

  async listMealPlanItems() {
    return sortMealPlanItems(readState().mealPlanItems)
  }

  async getBabyProfile() {
    return { ...readState().babyProfile }
  }

  async updateBabyProfile(profile: BabyProfile) {
    validateBabyProfile(profile)
    const nextProfile = { ...profile }
    const state = readState()
    writeState({ ...state, babyProfile: nextProfile })
    return nextProfile
  }

  async create(draft: CubeDraft) {
    const now = new Date().toISOString()
    const batch: CubeBatch = {
      id: crypto.randomUUID(),
      householdId: 'local',
      ...draft,
      expiresAt: calculateExpiresAt(draft.preparedAt),
      createdAt: now,
      updatedAt: now,
    }
    const state = readState()
    writeState({ ...state, batches: [...state.batches, batch] })
    return batch
  }

  async update(id: string, draft: CubeDraft, expectedUpdatedAt: string) {
    let updated: CubeBatch | undefined
    const state = readState()
    const batches = state.batches.map((batch) => {
      if (batch.id !== id) return batch
      if (batch.updatedAt !== expectedUpdatedAt) {
        throw new Error('다른 화면에서 먼저 바뀌었어요. 창을 닫고 다시 열어 주세요.')
      }
      updated = {
        ...batch,
        ...draft,
        expiresAt: calculateExpiresAt(draft.preparedAt),
        updatedAt: new Date().toISOString(),
      }
      return updated
    })

    if (!updated) throw new Error('수정할 큐브를 찾지 못했어요.')
    writeState({ ...state, batches })
    return updated
  }

  async consume(id: string, requestId = crypto.randomUUID()) {
    const state = readState()
    const existingRecord = state.consumptionRecords.find((record) => record.id === requestId)
    if (existingRecord) {
      if (existingRecord.batchId !== id) {
        throw new Error('이미 다른 큐브에 사용한 먹은 기록 요청이에요.')
      }
      const existingBatch = state.batches.find((batch) => batch.id === existingRecord.batchId)
      if (!existingBatch) throw new Error('먹은 기록의 큐브를 찾지 못했어요.')
      return { batch: existingBatch, record: existingRecord }
    }

    const target = state.batches.find((batch) => batch.id === id)
    if (!target) throw new Error('먹은 큐브를 찾지 못했어요.')
    if (target.quantity <= 0) throw new Error('남은 큐브가 없어요.')

    const now = new Date().toISOString()
    const updated: CubeBatch = {
      ...target,
      quantity: target.quantity - 1,
      updatedAt: now,
    }
    const record: ConsumptionRecord = {
      id: requestId,
      householdId: target.householdId,
      batchId: target.id,
      cubeName: target.name,
      unitAmount: target.unitAmount,
      unit: target.unit,
      consumedAt: now,
      createdAt: now,
      cancelledAt: null,
      planItemId: null,
      reaction: null,
      reactionNote: '',
    }

    writeState({
      ...state,
      batches: state.batches.map((batch) => (batch.id === id ? updated : batch)),
      consumptionRecords: [...state.consumptionRecords, record],
    })

    return { batch: updated, record }
  }

  async createMealPlanItems(draft: MealPlanDraft) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.plannedFor)) {
      throw new Error('식단 날짜를 확인해 주세요.')
    }
    if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(draft.mealSlot)) {
      throw new Error('식사 시간을 확인해 주세요.')
    }
    if (!Array.isArray(draft.selections) || draft.selections.length === 0) {
      throw new Error('식단에 담을 큐브를 골라 주세요.')
    }
    const batchIds = new Set(draft.selections.map((selection) => selection.batchId))
    if (batchIds.size !== draft.selections.length) {
      throw new Error('같은 큐브는 한 번만 골라 주세요.')
    }
    const totalQuantity = draft.selections.reduce((sum, selection) => {
      if (!Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 12) {
        throw new Error('큐브 종류별 개수는 1~12개로 정해 주세요.')
      }
      return sum + selection.quantity
    }, 0)
    if (totalQuantity > 12) {
      throw new Error('식단에는 한 번에 1~12개를 담을 수 있어요.')
    }

    const state = readState()
    const selectedBatches = draft.selections.map((selection) => {
      const batch = state.batches.find((item) => item.id === selection.batchId)
      if (!batch) throw new Error('식단에 담을 큐브를 찾지 못했어요.')
      return { batch, quantity: selection.quantity }
    })
    if (new Set(selectedBatches.map(({ batch }) => batch.householdId)).size !== 1) {
      throw new Error('같은 우리집의 큐브만 한 식단에 담을 수 있어요.')
    }

    const now = new Date().toISOString()
    let itemIndex = 0
    const items = selectedBatches.flatMap(({ batch, quantity }) =>
      Array.from({ length: quantity }, (): MealPlanItem => {
        const createdAt = new Date(new Date(now).getTime() + itemIndex).toISOString()
        itemIndex += 1
        return {
          id: crypto.randomUUID(),
          householdId: batch.householdId,
          batchId: batch.id,
          cubeName: batch.name,
          unitAmount: batch.unitAmount,
          unit: batch.unit,
          plannedFor: draft.plannedFor,
          mealSlot: draft.mealSlot,
          consumptionRecordId: null,
          createdAt,
          updatedAt: now,
        }
      }),
    )

    writeState({ ...state, mealPlanItems: [...state.mealPlanItems, ...items] })
    return items
  }

  async completeMealPlanItem(id: string, requestId = crypto.randomUUID()) {
    const state = readState()
    const planItem = state.mealPlanItems.find((item) => item.id === id)
    if (!planItem) throw new Error('먹을 식단 항목을 찾지 못했어요.')

    const alreadyCompleted = planItem.consumptionRecordId
      ? state.consumptionRecords.find(
          (record) => record.id === planItem.consumptionRecordId && !record.cancelledAt,
        )
      : undefined
    if (alreadyCompleted) {
      const batch = state.batches.find((item) => item.id === planItem.batchId)
      if (!batch) throw new Error('식단의 큐브를 찾지 못했어요.')
      return { batch, record: alreadyCompleted, planItem }
    }

    const conflictingRequest = state.consumptionRecords.find(
      (record) => record.id === requestId,
    )
    if (conflictingRequest) {
      throw new Error('이미 다른 먹은 기록에 사용한 요청이에요.')
    }

    const batch = state.batches.find((item) => item.id === planItem.batchId)
    if (!batch) throw new Error('식단의 큐브를 찾지 못했어요.')
    if (batch.quantity <= 0) throw new Error(`${batch.name} 큐브가 남아 있지 않아요.`)

    const now = new Date().toISOString()
    const updated: CubeBatch = {
      ...batch,
      quantity: batch.quantity - 1,
      updatedAt: now,
    }
    const record: ConsumptionRecord = {
      id: requestId,
      householdId: batch.householdId,
      batchId: batch.id,
      cubeName: planItem.cubeName,
      unitAmount: planItem.unitAmount,
      unit: planItem.unit,
      consumedAt: now,
      createdAt: now,
      cancelledAt: null,
      planItemId: planItem.id,
      reaction: null,
      reactionNote: '',
    }

    writeState({
      ...state,
      batches: state.batches.map((item) => (item.id === updated.id ? updated : item)),
      consumptionRecords: [...state.consumptionRecords, record],
      mealPlanItems: state.mealPlanItems.map((item) =>
        item.id === planItem.id
          ? { ...item, consumptionRecordId: record.id, updatedAt: now }
          : item,
      ),
    })
    return {
      batch: updated,
      record,
      planItem: { ...planItem, consumptionRecordId: record.id, updatedAt: now },
    }
  }

  async removeMealPlanItem(id: string) {
    const state = readState()
    const planItem = state.mealPlanItems.find((item) => item.id === id)
    if (!planItem) throw new Error('삭제할 식단 항목을 찾지 못했어요.')
    if (planItem.consumptionRecordId) {
      throw new Error('먹은 기록을 먼저 되돌린 뒤 식단에서 뺄 수 있어요.')
    }
    writeState({
      ...state,
      mealPlanItems: state.mealPlanItems.filter((item) => item.id !== id),
    })
  }

  async updateConsumptionReaction(
    recordId: string,
    reaction: FoodReaction | null,
    note: string,
  ) {
    const trimmedNote = note.trim()
    if (trimmedNote.length > 100) throw new Error('반응 메모는 100자 이하로 적어 주세요.')
    const state = readState()
    let updated: ConsumptionRecord | undefined
    const consumptionRecords = state.consumptionRecords.map((record) => {
      if (record.id !== recordId || record.cancelledAt) return record
      updated = { ...record, reaction, reactionNote: trimmedNote }
      return updated
    })
    if (!updated) throw new Error('반응을 남길 먹은 기록을 찾지 못했어요.')
    writeState({ ...state, consumptionRecords })
    return updated
  }

  async updateConsumptionRecord(recordId: string, update: ConsumptionRecordUpdate) {
    const consumedAt = new Date(update.consumedAt)
    if (Number.isNaN(consumedAt.getTime())) throw new Error('먹은 날짜와 시간을 확인해 주세요.')
    if (consumedAt.getTime() > Date.now()) {
      throw new Error('먹은 날짜와 시간은 현재보다 미래일 수 없어요.')
    }
    if (update.reaction && !['liked', 'okay', 'disliked', 'watch'].includes(update.reaction)) {
      throw new Error('아기 반응을 확인해 주세요.')
    }
    const trimmedNote = update.reactionNote.trim()
    if (trimmedNote.length > 100) throw new Error('반응 메모는 100자 이하로 적어 주세요.')

    const state = readState()
    let updated: ConsumptionRecord | undefined
    const consumptionRecords = state.consumptionRecords.map((record) => {
      if (record.id !== recordId || record.cancelledAt) return record
      updated = {
        ...record,
        consumedAt: consumedAt.toISOString(),
        reaction: update.reaction,
        reactionNote: trimmedNote,
      }
      return updated
    })
    if (!updated) throw new Error('수정할 먹은 기록을 찾지 못했어요.')
    writeState({ ...state, consumptionRecords })
    return updated
  }

  async deleteConsumptionRecord(recordId: string) {
    const state = readState()
    const targetRecord = state.consumptionRecords.find((record) => record.id === recordId)
    if (!targetRecord) throw new Error('삭제할 먹은 기록을 찾지 못했어요.')

    const targetBatch = state.batches.find((batch) => batch.id === targetRecord.batchId)
    if (targetRecord.cancelledAt) return { batch: null, stockRestored: false }
    if (targetBatch && targetBatch.quantity >= 999) {
      throw new Error('큐브 수량이 가득 차서 기록을 삭제할 수 없어요.')
    }

    const now = new Date().toISOString()
    const updated = targetBatch
      ? { ...targetBatch, quantity: targetBatch.quantity + 1, updatedAt: now }
      : null
    writeState({
      ...state,
      batches: updated
        ? state.batches.map((batch) => (batch.id === updated.id ? updated : batch))
        : state.batches,
      consumptionRecords: state.consumptionRecords.map((record) =>
        record.id === recordId ? { ...record, cancelledAt: now } : record,
      ),
      mealPlanItems: state.mealPlanItems.map((item) =>
        item.consumptionRecordId === recordId
          ? { ...item, consumptionRecordId: null, updatedAt: now }
          : item,
      ),
    })
    return { batch: updated, stockRestored: Boolean(updated) }
  }

  async undoConsumption(recordId: string) {
    const state = readState()
    const targetRecord = state.consumptionRecords.find((record) => record.id === recordId)
    if (!targetRecord) throw new Error('되돌릴 먹은 기록을 찾지 못했어요.')

    const targetBatch = state.batches.find((batch) => batch.id === targetRecord.batchId)
    if (!targetBatch) throw new Error('삭제된 큐브의 기록은 되돌릴 수 없어요.')
    if (targetRecord.cancelledAt) return targetBatch

    const latestRecord = sortRecords(
      state.consumptionRecords.filter((record) => !record.cancelledAt),
    )[0]
    if (latestRecord?.id !== recordId) {
      throw new Error('가장 최근에 먹은 기록부터 되돌릴 수 있어요.')
    }
    if (targetBatch.quantity >= 999) throw new Error('수량이 가득 차서 되돌릴 수 없어요.')

    const now = new Date().toISOString()
    const updated: CubeBatch = {
      ...targetBatch,
      quantity: targetBatch.quantity + 1,
      updatedAt: now,
    }
    writeState({
      ...state,
      batches: state.batches.map((batch) => (batch.id === updated.id ? updated : batch)),
      consumptionRecords: state.consumptionRecords.map((record) =>
        record.id === recordId ? { ...record, cancelledAt: now } : record,
      ),
      mealPlanItems: state.mealPlanItems.map((item) =>
        item.consumptionRecordId === recordId
          ? { ...item, consumptionRecordId: null, updatedAt: now }
          : item,
      ),
    })
    return updated
  }

  async incrementQuantity(id: string) {
    const state = readState()
    let updated: CubeBatch | undefined
    const batches = state.batches.map((batch) => {
      if (batch.id !== id) return batch
      if (batch.quantity >= 999) throw new Error('수량은 999개까지 저장할 수 있어요.')
      updated = {
        ...batch,
        quantity: batch.quantity + 1,
        updatedAt: new Date().toISOString(),
      }
      return updated
    })

    if (!updated) throw new Error('수량을 바꿀 큐브를 찾지 못했어요.')
    writeState({ ...state, batches })
    return updated
  }

  async remove(id: string, expectedUpdatedAt: string) {
    const state = readState()
    const target = state.batches.find((batch) => batch.id === id)
    if (!target) throw new Error('삭제할 큐브를 찾지 못했어요.')
    if (target.updatedAt !== expectedUpdatedAt) {
      throw new Error('다른 화면에서 먼저 바뀌었어요. 창을 닫고 다시 열어 주세요.')
    }
    const next = state.batches.filter((batch) => batch.id !== id)
    writeState({ ...state, batches: next })
  }

  subscribe(onChange: () => void, onStatus?: (status: SyncStatus) => void) {
    onStatus?.('connected')
    const handleLocalChange = () => onChange()
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === STORAGE_KEY ||
        event.key === PREVIOUS_STORAGE_KEY ||
        event.key === OLDER_STORAGE_KEY ||
        event.key === LEGACY_STORAGE_KEY
      ) {
        onChange()
      }
    }

    localEvents.addEventListener('change', handleLocalChange)
    window.addEventListener('storage', handleStorage)

    return () => {
      localEvents.removeEventListener('change', handleLocalChange)
      window.removeEventListener('storage', handleStorage)
    }
  }
}
