import type { CubeCategory, CubeUnit, FoodReaction, MealSlot } from '../types'

export interface DishPreparation {
  id: string
  householdId: string
  servingOn: string
  mealSlot: MealSlot
  status: 'prepared' | 'completed' | 'cancelled'
  preparedAt: string
  consumedAt: string | null
  completedAt: string | null
  outcome: 'all' | 'partial' | 'none' | null
  actualConsumedAmount: number | null
  actualConsumedUnit: CubeUnit | null
  reaction: FoodReaction | null
  reactionNote: string
  updatedAt: string
}

export interface DishPreparationItem {
  id: string
  householdId: string
  preparationId: string
  batchId: string
  sourceKind: 'frozen' | 'direct_fresh'
  preparedQuantity: number
  cubeName: string
  category: CubeCategory
  unitAmount: number | null
  unit: CubeUnit | null
  disposition: 'ready' | 'consumed' | 'offered_partial' | 'discarded' | 'corrected' | 'unused'
  preparedAt: string
}

export interface DishData {
  preparations: DishPreparation[]
  items: DishPreparationItem[]
}

export interface FrozenDishSelection {
  batchId: string
  quantity: number
}

export interface FreshDishDraft {
  recipeId: string | null
  name: string
  category: CubeCategory
  preparedAt: string
  unitAmount: number | null
  unit: CubeUnit | null
  memo: string
  ingredientNames: string[]
  totalMade: number
  toFreeze: number
}

export interface CompleteDishDraft {
  consumedAt: string
  outcome: 'all' | 'partial' | 'none'
  actualAmount: number | null
  actualUnit: CubeUnit | null
  reaction: FoodReaction | null
  note: string
  requestId: string
}
