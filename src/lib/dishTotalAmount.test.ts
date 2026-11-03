import { describe, expect, it } from 'vitest'
import type { DishPreparationItem } from '../data/dishPreparationTypes'
import { getDishTotalAmountLabel } from './dishTotalAmount'

function item(
  unitAmount: number | null,
  unit: DishPreparationItem['unit'],
  quantity = 1,
): DishPreparationItem {
  return {
    id: 'item', householdId: 'house', preparationId: 'prep', batchId: 'batch',
    sourceKind: 'frozen', preparedQuantity: quantity,
    cubeName: '테스트 큐브', category: 'topping', unitAmount, unit,
    disposition: 'ready', preparedAt: '2026-11-03T12:00:00.000Z',
  }
}

describe('식기에 담은 끼니별 총 용량', () => {
  it('스크린샷의 10g + 120g + 20g을 총 150g으로 보여 준다', () => {
    expect(getDishTotalAmountLabel([
      item(10, 'g'), item(120, 'g'), item(20, 'g'),
    ])).toBe('총 150g')
  })

  it('큐브 개수와 1개 용량을 곱해 합산한다', () => {
    expect(getDishTotalAmountLabel([
      item(30, 'g', 2), item(12.5, 'g', 3),
    ])).toBe('총 97.5g')
  })

  it('mL는 g으로 임의 환산하지 않고 별도 단위로 표시한다', () => {
    expect(getDishTotalAmountLabel([item(40, 'mL', 2)])).toBe('총 80mL')
    expect(getDishTotalAmountLabel([item(20, 'g'), item(50, 'mL')]))
      .toBe('단위별 20g + 50mL')
  })

  it('용량 미입력 큐브가 섞이면 전체 합계인 것처럼 표시하지 않는다', () => {
    expect(getDishTotalAmountLabel([item(20, 'g'), item(null, 'g', 2)]))
      .toBe('확인된 20g · 용량 미입력 2개')
    expect(getDishTotalAmountLabel([item(null, null, 2)])).toBe('총 용량 미입력')
  })

  it('담은 큐브가 없으면 합계를 표시하지 않는다', () => {
    expect(getDishTotalAmountLabel([])).toBeNull()
    expect(getDishTotalAmountLabel([item(20, 'g', 0)])).toBeNull()
  })
})
