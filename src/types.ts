export type CubeUnit = 'g' | 'mL'
export type CubeCategory = 'base' | 'topping' | 'snack' | 'other'
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type FoodReaction = 'liked' | 'okay' | 'disliked' | 'watch'

export interface Ingredient {
  id: string
  name: string
}

export interface CubeRecipe {
  id: string
  householdId: string
  name: string
  category: CubeCategory
  defaultUnitAmount: number | null
  defaultUnit: CubeUnit | null
  ingredients: Ingredient[]
}

export interface IngredientModel {
  recipes: CubeRecipe[]
  batchIngredients: Record<string, Ingredient[]>
  recordIngredients: Record<string, Ingredient[]>
}

export interface CubeDisposal {
  id: string
  householdId: string
  batchId: string
  quantity: number
  disposedAt: string
  cancelledAt: string | null
  createdAt: string
}

export interface CubeBatch {
  id: string
  householdId: string
  name: string
  category: CubeCategory
  preparedAt: string
  expiresAt: string
  quantity: number
  unitAmount: number | null
  unit: CubeUnit | null
  memo: string
  createdAt: string
  updatedAt: string
  recipeId?: string | null
  ingredientNames?: string[]
}

export interface CubeDraft {
  name: string
  category: CubeCategory
  preparedAt: string
  quantity: number
  unitAmount: number | null
  unit: CubeUnit | null
  memo: string
  recipeId?: string | null
  ingredientNames?: string[]
}

export interface BabyProfile {
  birthDate: string | null
  weaningStartedOn: string | null
}

export interface ConsumptionRecord {
  id: string
  householdId: string
  batchId: string
  cubeName: string
  unitAmount: number | null
  unit: CubeUnit | null
  consumedAt: string
  createdAt: string
  cancelledAt: string | null
  planItemId: string | null
  reaction: FoodReaction | null
  reactionNote: string
  ingredientNames?: string[]
}

export interface ConsumptionRecordUpdate {
  consumedAt: string
  reaction: FoodReaction | null
  reactionNote: string
}

export interface DeleteConsumptionResult {
  batch: CubeBatch | null
  stockRestored: boolean
}

export interface ConsumeResult {
  batch: CubeBatch
  record: ConsumptionRecord
}

export interface CubeDisposalResult {
  batch: CubeBatch
  disposal: CubeDisposal
  pendingPlanCount: number
}

export interface CancelCubeDisposalResult {
  batch: CubeBatch
  disposal: CubeDisposal
}

export interface MealPlanItem {
  id: string
  householdId: string
  batchId: string
  cubeName: string
  unitAmount: number | null
  unit: CubeUnit | null
  plannedFor: string
  mealSlot: MealSlot
  consumptionRecordId: string | null
  createdAt: string
  updatedAt: string
}

export interface MealPlanSelectionDraft {
  batchId: string
  quantity: number
}

export interface MealPlanDraft {
  plannedFor: string
  mealSlot: MealSlot
  selections: MealPlanSelectionDraft[]
}

export interface PlanItemConsumeResult extends ConsumeResult {
  planItem: MealPlanItem
}

export type ExpiryStatus = 'fresh' | 'soon' | 'expired'
