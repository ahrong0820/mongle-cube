import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CubeRepository } from '../data/repository'
import type { CubeBatch } from '../types'
import { DishPreparationPlanner } from './DishPreparationPlanner'
import { getSeoulDateKey } from '../lib/date'

const batch: CubeBatch = {
  id:'batch-rice', householdId:'household-1', name:'쌀죽',
  category:'base', preparedAt:'2026-10-19T01:00:00.000Z',
  expiresAt:'2026-11-02T01:00:00.000Z',
  quantity:8,unitAmount:30,unit:'g',memo:'',
  createdAt:'2026-10-19T01:00:00.000Z',
  updatedAt:'2026-10-19T01:00:00.000Z',
}

describe('식기에 담기 탭',()=>{
  it('다음 날 첫·둘째·셋째 끼니를 보여 주고 실제 담기 확정 시에만 저장한다',async()=>{
    const user=userEvent.setup()
    const createDishPreparation=vi.fn().mockResolvedValue({})
    render(
      <DishPreparationPlanner
        batches={[batch]}
        dishData={{ preparations:[], items:[] }}
        repository={{ createDishPreparation } as unknown as CubeRepository}
        loading={false}
        onChanged={vi.fn().mockResolvedValue(undefined)}
      />
    )
    const tomorrowSection=screen.getByRole('region',{name:'다음 날 식기 미리 담기'})
    expect(within(tomorrowSection).getByText('첫 번째 끼니')).toBeInTheDocument()
    expect(within(tomorrowSection).getByText('두 번째 끼니')).toBeInTheDocument()
    expect(within(tomorrowSection).getByText('세 번째 끼니')).toBeInTheDocument()
    const mealCard=within(screen.getByRole('region',{name:'다음 날 식기 미리 담기'})).getByText('첫 번째 끼니').closest('article')!
    await user.click(within(mealCard).getByRole('button',{name:'+ 냉동 큐브 담기'}))
    expect(createDishPreparation).not.toHaveBeenCalled()
    const input=within(mealCard).getByLabelText('쌀죽 식기에 담을 개수')
    await user.clear(input)
    await user.type(input,'2')
    await user.click(within(mealCard).getByRole('button',{name:'식기에 담았어요 · 2개'}))
    expect(createDishPreparation).toHaveBeenCalledWith(
      getSeoulDateKey(new Date(Date.now()+24*60*60*1000)),'breakfast',[{batchId:'batch-rice',quantity:2}]
    )
  })

  it('다음 날 식기에 미리 담은 냉동 큐브에 오늘 만든 큐브도 추가할 수 있다',async()=>{
    const user=userEvent.setup()
    const addFreshDishItem=vi.fn().mockResolvedValue({})
    render(
      <DishPreparationPlanner
        batches={[batch]}
        dishData={{
          preparations:[{
            id:'prep-1',householdId:'household-1',servingOn:getSeoulDateKey(new Date(Date.now()+24*60*60*1000)),
            mealSlot:'breakfast',status:'prepared',preparedAt:new Date().toISOString(),
            consumedAt:null,completedAt:null,outcome:null,actualConsumedAmount:null,
            actualConsumedUnit:null,reaction:null,reactionNote:'',updatedAt:new Date().toISOString(),
          }],
          items:[{
            id:'prepared-rice',householdId:'household-1',preparationId:'prep-1',
            batchId:'batch-rice',sourceKind:'frozen',preparedQuantity:2,
            cubeName:'쌀죽',category:'base',unitAmount:30,unit:'g',
            disposition:'ready',preparedAt:new Date().toISOString(),
          }],
        }}
        repository={{ addFreshDishItem } as unknown as CubeRepository}
        loading={false}
        onChanged={vi.fn().mockResolvedValue(undefined)}
      />
    )
    const mealCard=within(screen.getByRole('region',{name:'다음 날 식기 미리 담기'})).getByText('첫 번째 끼니').closest('article')!
    expect(within(mealCard).getByText('쌀죽 2개')).toBeInTheDocument()
    await user.click(within(mealCard).getByRole('button',{name:'+ 오늘 만든 큐브'}))
    await user.type(within(mealCard).getByLabelText('바로 만든 큐브 이름'),'당근')
    await user.type(within(mealCard).getByLabelText('바로 만든 큐브 들어간 재료'),'당근')
    await user.click(within(mealCard).getByRole('button',{name:'만든 큐브 식기에 추가'}))
    expect(addFreshDishItem).toHaveBeenCalledWith('prep-1',expect.objectContaining({
      name:'당근',ingredientNames:['당근'],totalMade:1,toFreeze:0
    }))
  })
})
