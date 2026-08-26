import type {
  ConsumptionRecord,
  CubeBatch,
  CubeRecipe,
  Ingredient,
  IngredientModel,
} from '../types'

export const EMPTY_INGREDIENT_MODEL: IngredientModel = {
  recipes: [],
  batchIngredients: {},
  recordIngredients: {},
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
}

function ingredientFromName(name: string): Ingredient {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  return { id: `local-ingredient:${normalize(cleaned)}`, name: cleaned }
}

export function deriveLocalIngredientModel(
  batches: CubeBatch[],
  records: ConsumptionRecord[],
): IngredientModel {
  const batchIngredients: Record<string, Ingredient[]> = {}
  const recordIngredients: Record<string, Ingredient[]> = {}
  const recipesByName = new Map<string, CubeRecipe & { preparedAt: string }>()
  const batchById = new Map(batches.map((batch) => [batch.id, batch]))

  for (const batch of batches) {
    const ingredients = (batch.ingredientNames ?? []).map(ingredientFromName)
    batchIngredients[batch.id] = ingredients
    const key = normalize(batch.name)
    const current = recipesByName.get(key)
    if (!current || current.preparedAt < batch.preparedAt) {
      recipesByName.set(key, {
        id: batch.recipeId || `local-recipe:${key}`,
        householdId: batch.householdId,
        name: batch.name,
        category: batch.category,
        defaultUnitAmount: batch.unitAmount,
        defaultUnit: batch.unit,
        ingredients,
        preparedAt: batch.preparedAt,
      })
    }
  }

  for (const record of records) {
    const names = record.ingredientNames ?? batchById.get(record.batchId)?.ingredientNames ?? []
    recordIngredients[record.id] = names.map(ingredientFromName)
  }

  return {
    recipes: [...recipesByName.values()]
      .map(({ preparedAt: _preparedAt, ...recipe }) => recipe)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR')),
    batchIngredients,
    recordIngredients,
  }
}
