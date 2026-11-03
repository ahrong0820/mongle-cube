import type { DishPreparationItem } from '../data/dishPreparationTypes'

const amountFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 3,
})

/**
 * Summary of the original amounts placed in a dish, not the amount eaten.
 * Never silently treat mL as grams or count items with missing unit amounts.
 */
export function getDishTotalAmountLabel(items: DishPreparationItem[]): string | null {
  let grams = 0
  let milliliters = 0
  let unknownQuantity = 0

  for (const item of items) {
    if (!Number.isFinite(item.preparedQuantity) || item.preparedQuantity <= 0) continue

    if (
      item.unitAmount === null ||
      !Number.isFinite(item.unitAmount) ||
      item.unitAmount <= 0 ||
      (item.unit !== 'g' && item.unit !== 'mL')
    ) {
      unknownQuantity += item.preparedQuantity
      continue
    }

    const amount = item.unitAmount * item.preparedQuantity
    if (item.unit === 'g') grams += amount
    else milliliters += amount
  }

  const known = [
    ...(grams > 0 ? [`${amountFormatter.format(grams)}g`] : []),
    ...(milliliters > 0 ? [`${amountFormatter.format(milliliters)}mL`] : []),
  ]

  if (known.length === 0) return unknownQuantity > 0 ? '총 용량 미입력' : null

  const amount = known.join(' + ')
  if (unknownQuantity > 0) {
    return `확인된 ${amount} · 용량 미입력 ${amountFormatter.format(unknownQuantity)}개`
  }
  return known.length > 1 ? `단위별 ${amount}` : `총 ${amount}`
}
