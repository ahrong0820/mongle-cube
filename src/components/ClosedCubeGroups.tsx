import { formatShortDate } from '../lib/date'
import type { CubeBatch, CubeDisposal, CubeRecipe } from '../types'
import { CubeCard } from './CubeCard'
import { Icon } from './Icon'

interface ClosedCubeGroupsProps {
  batches: CubeBatch[]
  disposals: CubeDisposal[]
  recipes: CubeRecipe[]
  pendingIds: ReadonlySet<string>
  onCancelDisposal: (batch: CubeBatch, disposal: CubeDisposal) => void
  onConsume: (batch: CubeBatch) => void
  onEdit: (batch: CubeBatch) => void
  onIncrement: (batch: CubeBatch) => void
  onRemake: (batch: CubeBatch) => void
}

interface ClosedGroup {
  key: string
  name: string
  batches: CubeBatch[]
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('ko-KR')
}

function fallbackGroupKey(batch: CubeBatch) {
  return [
    normalized(batch.name),
    batch.category,
    batch.unitAmount ?? 'none',
    batch.unit ?? 'none',
  ].join('|')
}

function groupClosedBatches(batches: CubeBatch[], recipes: CubeRecipe[]): ClosedGroup[] {
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]))
  const groups = new Map<string, ClosedGroup>()

  for (const batch of batches) {
    const key = batch.recipeId ? `recipe:${batch.recipeId}` : `legacy:${fallbackGroupKey(batch)}`
    const recipe = batch.recipeId ? recipeById.get(batch.recipeId) : null
    const existing = groups.get(key)
    if (existing) {
      existing.batches.push(batch)
    } else {
      groups.set(key, {
        key,
        name: recipe?.name ?? batch.name,
        batches: [batch],
      })
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      batches: [...group.batches].sort(
        (a, b) => new Date(b.preparedAt).getTime() - new Date(a.preparedAt).getTime(),
      ),
    }))
    .sort((a, b) => {
      const aLatest = new Date(a.batches[0]?.preparedAt ?? 0).getTime()
      const bLatest = new Date(b.batches[0]?.preparedAt ?? 0).getTime()
      return bLatest - aLatest || a.name.localeCompare(b.name, 'ko-KR')
    })
}

export function ClosedCubeGroups({
  batches,
  disposals,
  recipes,
  pendingIds,
  onCancelDisposal,
  onConsume,
  onEdit,
  onIncrement,
  onRemake,
}: ClosedCubeGroupsProps) {
  const disposalByBatchId = new Map(
    disposals.filter((disposal) => !disposal.cancelledAt).map((disposal) => [disposal.batchId, disposal]),
  )
  const groups = groupClosedBatches(batches, recipes)

  return (
    <div className="closed-cube-groups">
      {groups.map((group) => {
        const discardedCount = group.batches.filter((batch) => disposalByBatchId.has(batch.id)).length
        const eatenCount = group.batches.length - discardedCount
        const summaryParts = [`${group.batches.length}번 제작`]
        if (eatenCount > 0) summaryParts.push(`다 먹음 ${eatenCount}회`)
        if (discardedCount > 0) summaryParts.push(`폐기 ${discardedCount}회`)
        const latest = group.batches[0]

        return (
          <details className="closed-cube-group" key={group.key}>
            <summary>
              <span className="closed-cube-group__icon" aria-hidden="true">
                <Icon name="snowflake" size={18} />
              </span>
              <span className="closed-cube-group__copy">
                <strong>{group.name}</strong>
                <small>{summaryParts.join(' · ')}</small>
                {latest && <small>최근 {formatShortDate(latest.preparedAt)} 제작</small>}
              </span>
              <span className="closed-cube-group__chevron" aria-hidden="true">
                <Icon name="chevron" size={18} />
              </span>
            </summary>

            <div className="closed-cube-group__history">
              {group.batches.map((batch) => {
                const disposal = disposalByBatchId.get(batch.id) ?? null
                return (
                  <CubeCard
                    batch={batch}
                    disposal={disposal}
                    key={batch.id}
                    onCancelDisposal={disposal ? onCancelDisposal : undefined}
                    onConsume={onConsume}
                    onEdit={onEdit}
                    onIncrement={onIncrement}
                    onRemake={onRemake}
                    pending={pendingIds.has(batch.id)}
                  />
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}
