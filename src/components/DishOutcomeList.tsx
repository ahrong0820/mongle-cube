import { formatHistoryTime, getSeoulDateKey } from '../lib/date'
import type { DishData, DishPreparation } from '../data/dishPreparationTypes'

export function dishOutcomeLabel(preparation: DishPreparation) {
  return preparation.outcome === 'partial' ? '일부 먹음' : '먹이지 않음'
}

export function getDishOutcomePreparations(data: DishData, date?: string) {
  return data.preparations
    .filter((prep) =>
      prep.status === 'completed' &&
      (prep.outcome === 'partial' || prep.outcome === 'none') &&
      prep.consumedAt &&
      (!date || getSeoulDateKey(prep.consumedAt) === date),
    )
    .sort((a, b) => new Date(b.consumedAt!).getTime() - new Date(a.consumedAt!).getTime())
}

export function DishOutcomeList({
  dishData,
  date,
}: {
  dishData: DishData
  date?: string
}) {
  const outcomes = getDishOutcomePreparations(dishData, date)
  if (!outcomes.length) return null

  const slotNames = {
    breakfast: '첫 번째 끼니',
    lunch: '두 번째 끼니',
    dinner: '세 번째 끼니',
    snack: '간식',
  }

  return (
    <section className="dish-outcome-summary" aria-label="일부 섭취 및 먹지 않은 끼니">
      <h3>한 끼 섭취 상태</h3>
      <p>섞어서 일부만 먹은 경우 큐브별 섭취량은 추정하지 않아요.</p>
      {outcomes.map((prep) => {
        const items = dishData.items.filter((item) =>
          item.preparationId === prep.id && item.disposition !== 'corrected' &&
          item.disposition !== 'discarded',
        )
        return (
          <article className="dish-outcome-summary__meal" key={prep.id}>
            <div className="dish-outcome-summary__meal-header">
              <strong>{slotNames[prep.mealSlot]} · {formatHistoryTime(prep.consumedAt!)}</strong>
              <b>{dishOutcomeLabel(prep)}</b>
            </div>
            {!date && <small>날짜: {getSeoulDateKey(prep.consumedAt!)}</small>}
            <p>준비한 음식: {items.length
              ? items.map((item) => `${item.cubeName} ${item.preparedQuantity}개`).join(' · ')
              : '—'}</p>
            <p>실제 먹은 양: {prep.outcome === 'none'
              ? '0g'
              : prep.actualConsumedAmount === null
                ? '미측정'
                : `${prep.actualConsumedAmount}${prep.actualConsumedUnit ?? ''}`}</p>
            {prep.reactionNote && <p>메모: {prep.reactionNote}</p>}
            <small>준비한 음식 목록과 실제 섭취량은 별개예요. 수정은 식기에 담기에서 해 주세요.</small>
          </article>
        )
      })}
    </section>
  )
}
