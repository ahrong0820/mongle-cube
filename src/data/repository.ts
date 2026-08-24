import type {
  BabyProfile,
  ConsumeResult,
  ConsumptionRecord,
  CubeBatch,
  CubeDraft,
  FoodReaction,
  MealPlanDraft,
  MealPlanItem,
  PlanItemConsumeResult,
} from '../types'

export type RepositoryMode = 'local' | 'shared'
export type SyncStatus = 'connecting' | 'connected' | 'disconnected'

export interface CubeRepository {
  readonly mode: RepositoryMode
  list(): Promise<CubeBatch[]>
  listConsumptionRecords(): Promise<ConsumptionRecord[]>
  listMealPlanItems(): Promise<MealPlanItem[]>
  getBabyProfile(): Promise<BabyProfile>
  updateBabyProfile(profile: BabyProfile): Promise<BabyProfile>
  create(draft: CubeDraft): Promise<CubeBatch>
  update(id: string, draft: CubeDraft, expectedUpdatedAt: string): Promise<CubeBatch>
  consume(id: string, requestId?: string): Promise<ConsumeResult>
  createMealPlanItems(draft: MealPlanDraft): Promise<MealPlanItem[]>
  completeMealPlanItem(id: string, requestId?: string): Promise<PlanItemConsumeResult>
  removeMealPlanItem(id: string): Promise<void>
  updateConsumptionReaction(
    recordId: string,
    reaction: FoodReaction | null,
    note: string,
  ): Promise<ConsumptionRecord>
  undoConsumption(recordId: string): Promise<CubeBatch>
  incrementQuantity(id: string): Promise<CubeBatch>
  remove(id: string, expectedUpdatedAt: string): Promise<void>
  subscribe(onChange: () => void, onStatus?: (status: SyncStatus) => void): () => void
}

export class InviteRequiredError extends Error {
  constructor() {
    super('가족 공유용 초대 링크로 열어 주세요.')
    this.name = 'InviteRequiredError'
  }
}

export class AppConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppConfigurationError'
  }
}
