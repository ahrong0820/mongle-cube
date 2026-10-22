import { useMemo, useState } from 'react'
import { fromSeoulDateTimeInput, getSeoulDateKey, toSeoulDateTimeInput } from '../lib/date'
import type { CubeBatch, FoodReaction, MealSlot } from '../types'
import type {
  CompleteDishDraft, DishData, DishPreparation, DishPreparationItem,
  FreshDishDraft, FrozenDishSelection,
} from '../data/dishPreparationTypes'
import type { CubeRepository } from '../data/repository'
import { Icon } from './Icon'

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '첫 번째 끼니',
  lunch: '두 번째 끼니',
  dinner: '세 번째 끼니',
  snack: '간식',
}
const SLOTS: MealSlot[] = ['breakfast','lunch','dinner','snack']
const REACTION_OPTIONS: { value: FoodReaction; label: string }[] = [
  { value: 'liked', label: '잘 먹음' },
  { value: 'okay', label: '보통' },
  { value: 'disliked', label: '거부' },
  { value: 'watch', label: '관찰 필요' },
]
const EMPTY_DISH: DishData = { preparations: [], items: [] }

function FrozenPicker({
  batches, onCancel, onSubmit, submitting, servingOn,
}: {
  batches: CubeBatch[]
  servingOn: string
  onCancel: () => void
  onSubmit: (selected: FrozenDishSelection[]) => Promise<void>
  submitting: boolean
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const available = batches.filter((batch) => batch.quantity > 0 && getSeoulDateKey(batch.expiresAt) >= servingOn)
  const selections = available
    .map((batch) => ({ batchId: batch.id, quantity: quantities[batch.id] ?? 0 }))
    .filter((item) => item.quantity > 0)
  const total = selections.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <div className="dish-picker">
      <strong>실제로 식기에 담는 냉동 큐브</strong>
      <p>수량을 고른 뒤 실제로 꺼내 담았을 때 확정해 주세요.</p>
      {available.length === 0 ? (
        <p>해당 식사 날짜까지 보관기한이 남은 냉동 큐브가 없어요.</p>
      ) : available.map((batch) => (
        <label className="dish-picker__row" key={batch.id}>
          <span>{batch.name}<small>냉동실 {batch.quantity}개 · 1개 {batch.unitAmount ?? '—'}{batch.unit ?? ''}</small></span>
          <input
            aria-label={`${batch.name} 식기에 담을 개수`}
            disabled={submitting}
            inputMode="numeric"
            min={0}
            max={Math.min(batch.quantity,12)}
            onChange={(event) => {
              const next = Number(event.target.value)
              setQuantities((current) => ({
                ...current,
                [batch.id]: Number.isInteger(next) ? Math.max(0,Math.min(next,batch.quantity,12)) : 0,
              }))
              setError('')
            }}
            type="number"
            value={quantities[batch.id] ?? 0}
          />
        </label>
      ))}
      <small>선택 {total}개 · 한 끼는 최대 12개</small>
      {error && <p role="alert">{error}</p>}
      <div className="dish-actions">
        <button disabled={submitting} onClick={onCancel} type="button">취소</button>
        <button
          className="primary-button"
          disabled={submitting || total===0 || total>12}
          onClick={() => void onSubmit(selections).catch((e: unknown) =>
            setError(e instanceof Error ? e.message : '저장하지 못했어요.'))}
          type="button"
        >
          {submitting ? '담는 중' : `식기에 담았어요 · ${total}개`}
        </button>
      </div>
    </div>
  )
}

function FreshPicker({
  submitting, onCancel, onSubmit,
}: {
  submitting: boolean
  onCancel: () => void
  onSubmit: (draft: FreshDishDraft) => Promise<void>
}) {
  const [name,setName]=useState('')
  const [ingredientText,setIngredientText]=useState('')
  const [category,setCategory]=useState<FreshDishDraft['category']>('topping')
  const [unitAmount,setUnitAmount]=useState('10')
  const [unit,setUnit]=useState<FreshDishDraft['unit']>('g')
  const [totalMade,setTotalMade]=useState('1')
  const [toFreeze,setToFreeze]=useState('0')
  const [error,setError]=useState('')
  const direct = Number(totalMade)-Number(toFreeze)
  const save=async()=>{
    const ingredients=[...new Set(ingredientText.split(/[,，\n]/).map(s=>s.trim()).filter(Boolean))]
    if (!name.trim() || ingredients.length===0 || Number(unitAmount)<=0 ||
      !Number.isInteger(Number(totalMade)) || !Number.isInteger(Number(toFreeze)) ||
      Number(totalMade)<1 || Number(totalMade)>999 || Number(toFreeze)<0 || direct<1 || direct>12) {
      setError('큐브 이름, 들어간 재료, 용량, 제작 개수를 확인해 주세요.')
      return
    }
    try {
      await onSubmit({
        recipeId: null, name: name.trim(), category, preparedAt: new Date().toISOString(),
        unitAmount: Number(unitAmount), unit, memo: '', ingredientNames: ingredients,
        totalMade: Number(totalMade), toFreeze: Number(toFreeze),
      })
    } catch(e) { setError(e instanceof Error ? e.message : '저장하지 못했어요.') }
  }
  return (
    <div className="dish-picker dish-fresh-picker">
      <strong>오늘 만든 큐브 바로 추가</strong>
      <p>냉동할 개수만 냉동실 재고로 등록하고, 나머지는 현재 식기에 담아요.</p>
      <label>큐브 이름<input aria-label="바로 만든 큐브 이름" value={name} disabled={submitting} onChange={e=>setName(e.target.value)} maxLength={40}/></label>
      <label>들어간 재료 (쉼표로 구분)<textarea aria-label="바로 만든 큐브 들어간 재료" value={ingredientText} disabled={submitting} onChange={e=>setIngredientText(e.target.value)} placeholder="쌀, 당근" rows={2}/></label>
      <label>종류
        <select value={category} disabled={submitting} onChange={e=>setCategory(e.target.value as FreshDishDraft['category'])}>
          <option value="base">베이스</option><option value="topping">토핑</option>
          <option value="snack">간식</option><option value="other">기타</option>
        </select>
      </label>
      <div className="dish-fresh-picker__numbers">
        <label>1개 용량<input aria-label="바로 만든 큐브 1개 용량" type="number" min="0.01" step="0.01" value={unitAmount} onChange={e=>setUnitAmount(e.target.value)} disabled={submitting}/></label>
        <label>단위<select value={unit ?? 'g'} onChange={e=>setUnit(e.target.value as 'g'|'mL')} disabled={submitting}><option value="g">g</option><option value="mL">mL</option></select></label>
        <label>총 만든 개수<input aria-label="총 만든 개수" type="number" min="1" max="999" value={totalMade} onChange={e=>setTotalMade(e.target.value)} disabled={submitting}/></label>
        <label>냉동 보관 개수<input aria-label="냉동 보관 개수" type="number" min="0" value={toFreeze} onChange={e=>setToFreeze(e.target.value)} disabled={submitting}/></label>
      </div>
      <p>현재 식기에 담을 개수: <strong>{Number.isFinite(direct) ? direct : '—'}개</strong></p>
      {error && <p role="alert">{error}</p>}
      <div className="dish-actions">
        <button type="button" disabled={submitting} onClick={onCancel}>취소</button>
        <button className="primary-button" type="button" disabled={submitting} onClick={()=>void save()}>
          {submitting ? '추가 중' : '만든 큐브 식기에 추가'}
        </button>
      </div>
    </div>
  )
}

function MealCompletion({
  preparation, submitting, onCancel, onComplete,
}: {
  preparation: DishPreparation
  submitting: boolean
  onCancel: () => void
  onComplete: (draft: CompleteDishDraft) => Promise<void>
}) {
  const [outcome,setOutcome]=useState<CompleteDishDraft['outcome']>('all')
  const [consumedAt,setConsumedAt]=useState(()=>preparation.servingOn===getSeoulDateKey(new Date()) ? toSeoulDateTimeInput(new Date()) : '')
  const [actualAmount,setActualAmount]=useState('')
  const [actualUnit,setActualUnit]=useState<'g'|'mL'>('g')
  const [reaction,setReaction]=useState<FoodReaction|null>(null)
  const [note,setNote]=useState('')
  const [error,setError]=useState('')
  const [requestId]=useState(()=>crypto.randomUUID())
  const submit=async()=>{
    let iso:string
    try { iso=fromSeoulDateTimeInput(consumedAt) } catch {setError('먹은 시간을 확인해 주세요.');return}
    if (new Date(iso).getTime()>Date.now() ||
      getSeoulDateKey(iso)!==preparation.servingOn) {
      setError('해당 끼니 날짜의 지나간 시간만 입력할 수 있어요.'); return
    }
    if (actualAmount.trim() && (!Number.isFinite(Number(actualAmount)) || Number(actualAmount)<0)) {
      setError('실제로 먹은 양을 확인해 주세요.');return
    }
    if (outcome==='partial' && actualAmount.trim() && Number(actualAmount)===0) {
      setError('일부 먹음은 0보다 큰 섭취량을 입력해 주세요.');return
    }
    try {
      await onComplete({
        consumedAt:iso, outcome,
        actualAmount:outcome==='none'?0:actualAmount.trim()?Number(actualAmount):null,
        actualUnit:outcome==='none'?'g':actualAmount.trim()?actualUnit:null,
        reaction:outcome==='none'?null:reaction,note,requestId,
      })
    } catch(e) {setError(e instanceof Error?e.message:'완료하지 못했어요.')}
  }
  return (
    <div className="dish-picker dish-completion">
      <strong>한 끼 먹은 기록 완료</strong>
      {preparation.servingOn!==getSeoulDateKey(new Date()) && (
        <p className="dish-completion__notice">이 식기의 식사 날짜는 {preparation.servingOn}입니다. 이 날짜에 실제로 먹였다면 정확한 섭취 시각을 선택해 주세요. 오늘 먹였다면 위의 식사 날짜 정정 안내를 이용해 주세요.</p>
      )}
      <label>실제로 먹인 시간<input aria-label="실제로 먹인 시간" type="datetime-local" required disabled={submitting} value={consumedAt} onChange={e=>setConsumedAt(e.target.value)}/></label>
      <label>먹은 정도
        <select aria-label="먹은 정도" disabled={submitting} value={outcome} onChange={e=>setOutcome(e.target.value as CompleteDishDraft['outcome'])}>
          <option value="all">전부 먹음</option>
          <option value="partial">일부 먹음</option>
          <option value="none">먹지 않음</option>
        </select>
      </label>
      {outcome==='partial' && (
        <p className="dish-completion__notice">섞어서 일부만 먹었다면 개별 큐브를 모두 먹은 것으로 기록하지 않아요. 실제 섭취량은 끼니 단위로 남깁니다.</p>
      )}
      {outcome!=='none' && (
        <>
          <label>실제로 먹은 양 (모르면 비워도 돼요)
            <input aria-label="실제로 먹은 양" type="number" min="0" step="0.1" disabled={submitting} value={actualAmount} onChange={e=>setActualAmount(e.target.value)}/>
          </label>
          <label>실제 섭취량 단위
            <select aria-label="실제 섭취량 단위" disabled={submitting} value={actualUnit} onChange={e=>setActualUnit(e.target.value as 'g'|'mL')}>
              <option value="g">g</option><option value="mL">mL</option>
            </select>
          </label>
          <label>반응
            <select aria-label="한 끼 반응" disabled={submitting} value={reaction??''} onChange={e=>setReaction(e.target.value?e.target.value as FoodReaction:null)}>
              <option value="">미기록</option>{REACTION_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>반응 메모<input aria-label="한 끼 반응 메모" disabled={submitting} value={note} onChange={e=>setNote(e.target.value)} maxLength={100}/></label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="dish-actions">
        <button disabled={submitting} onClick={onCancel} type="button">취소</button>
        <button className="primary-button" disabled={submitting} onClick={()=>void submit()} type="button">
          {submitting?'기록 중':'한 끼 기록 완료'}
        </button>
      </div>
    </div>
  )
}

interface Props {
  batches: CubeBatch[]
  dishData?: DishData
  repository: CubeRepository
  loading: boolean
  onChanged: () => Promise<void>
}

export function DishPreparationPlanner({
  batches, dishData=EMPTY_DISH, repository, loading, onChanged,
}: Props) {
  const [editingKey,setEditingKey]=useState<string|null>(null)
  const [editMode,setEditMode]=useState<'frozen'|'fresh'|'complete'|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const itemsByPreparation=useMemo(()=>{
    const map=new Map<string,DishPreparationItem[]>()
    for(const item of dishData.items){
      map.set(item.preparationId,[...(map.get(item.preparationId)??[]),item])
    }
    return map
  },[dishData.items])

  const run=async(operation:()=>Promise<unknown>)=>{
    if(busy)return
    setBusy(true);setError('')
    try {
      await operation(); await onChanged()
      setEditMode(null);setEditingKey(null)
    } catch(e){
      const message=e instanceof Error?e.message:'요청을 처리하지 못했어요.'
      setError(message)
      throw e
    } finally {setBusy(false)}
  }

  const setPanel=(key:string,mode:'frozen'|'fresh'|'complete')=>{
    setEditingKey(key);setEditMode(mode);setError('')
  }

  const executePrepare=async(
    slot:MealSlot, servingOn:string, selected:FrozenDishSelection[], prep: DishPreparation|undefined,
  )=>{
    if(prep) {
      if(!repository.addFrozenDishItems)throw Error('현재 연결에서 지원하지 않는 기능입니다.')
      await run(()=>repository.addFrozenDishItems!(prep.id,selected))
    } else {
      if(!repository.createDishPreparation)throw Error('현재 연결에서 지원하지 않는 기능입니다.')
      await run(()=>repository.createDishPreparation!(servingOn,slot,selected))
    }
  }

  const removeItem=async(item:DishPreparationItem, resolution:'corrected'|'discarded')=>{
    const message=resolution==='corrected'
      ? '실제로 꺼내지 않은 선택 실수인가요? 확인하면 냉동실 재고로 복원돼요.'
      : '실제로 식기에서 버리는 큐브인가요? 냉동실 재고는 복원되지 않아요.'
    if(!window.confirm(message))return
    if(!repository.removeDishItem)return
    try {await run(()=>repository.removeDishItem!(item.id,resolution))}
    catch {/* error displayed within screen */}
  }

  const today=getSeoulDateKey(new Date())
  const tomorrow=getSeoulDateKey(new Date(Date.now()+24*60*60*1000))
  const yesterday=getSeoulDateKey(new Date(Date.now()-24*60*60*1000))
  const waitingPreparations=dishData.preparations
    .filter(prep=>prep.status==='prepared' && prep.servingOn<=today)
    .sort((a,b)=>b.servingOn.localeCompare(a.servingOn) || SLOTS.indexOf(a.mealSlot)-SLOTS.indexOf(b.mealSlot))
  const futureLegacyPreparations=dishData.preparations
    .filter(prep=>prep.status==='prepared' && prep.servingOn>tomorrow)
    .sort((a,b)=>a.servingOn.localeCompare(b.servingOn) || SLOTS.indexOf(a.mealSlot)-SLOTS.indexOf(b.mealSlot))
  const incorrectDatePreparations=dishData.preparations.filter(prep=>
    prep.status==='prepared' &&
    prep.servingOn===yesterday &&
    getSeoulDateKey(prep.preparedAt)===yesterday
  )
  const correctDate=async(prep:DishPreparation)=>{
    if(!repository.correctDishServingDate)return
    if(!window.confirm('어제 식사 날짜로 저장된 이 식기를 오늘 식사로 옮길까요? 냉동실 재고나 준비한 큐브는 변경되지 않아요.'))return
    try{
      await run(()=>repository.correctDishServingDate!(prep.id,today))
    }catch{/* error displayed above the meals */}
  }
  const renderDishCard=(
    slot:MealSlot, servingOn:string, prep: DishPreparation|undefined,
    mode:'waiting'|'prepare'|'legacy',
  )=>{
    const allItems=prep?itemsByPreparation.get(prep.id)??[]:[]
    const activeItems=allItems.filter(item=>
      item.disposition==='ready' || item.disposition==='consumed' ||
      item.disposition==='offered_partial' || item.disposition==='unused',
    )
    const quantity=activeItems.reduce((total,item)=>total+item.preparedQuantity,0)
    const cardKey=mode==='prepare'?`prepare:${slot}`:prep?.id??`empty:${slot}`
    const opening=editingKey===cardKey
    const canAdd=mode==='prepare'
    const canComplete=mode==='waiting' && prep?.status==='prepared' && quantity>0
    return (
      <article className="dish-planner__slot" key={cardKey}>
        <header>
          <div>
            <strong>{SLOT_LABELS[slot]}</strong>
            <small>{prep?.status==='completed'
              ? prep.outcome==='all'?'식사 완료':prep.outcome==='partial'?'일부 먹음':'먹지 않음'
              :prep
                ? mode==='prepare'?'미리 담음 · 냉장 해동 중':'먹은 기록 대기'
                :'아직 식기에 담지 않음'}</small>
          </div>
          <b>{quantity}개</b>
        </header>
        {prep && <small className="dish-planner__prepared-at">
          식사 예정일 {prep.servingOn} · 담은 시각 {toSeoulDateTimeInput(prep.preparedAt).replace('T',' ')}
        </small>}
        {activeItems.length>0 && (
          <ul className="dish-planner__items">
            {activeItems.map(item=>(
              <li key={item.id}>
                <span>
                  <b>{item.cubeName} {item.preparedQuantity}개</b>
                  <small>{item.sourceKind==='frozen'?'냉동실에서 담음':'직접 제조'} · 1개 {item.unitAmount??'—'}{item.unit??''}</small>
                </span>
                {prep?.status==='prepared' && item.disposition==='ready' && (
                  <span className="dish-planner__item-actions">
                    <button type="button" disabled={busy} onClick={()=>void removeItem(item,'corrected')}>선택 실수</button>
                    <button type="button" disabled={busy} onClick={()=>void removeItem(item,'discarded')}>폐기</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {prep?.status==='completed' && (
          <div className="dish-planner__outcome">
            {prep.outcome==='partial'
              ? `일부 먹음 · 실제 섭취량 ${prep.actualConsumedAmount??'미측정'}${prep.actualConsumedUnit??''}`
              :prep.outcome==='none'?'먹이지 않았어요':'담아둔 큐브를 전부 먹었어요'}
            {prep.outcome==='partial' && <small>재료별 섭취량을 추정하지 않았어요.</small>}
            <button type="button" disabled={busy} onClick={()=>{
              if(!repository.cancelDishCompletion||!window.confirm('완료를 취소해 준비 상태로 되돌릴까요? 이미 꺼낸 큐브는 냉동실 재고로 복원되지 않아요.'))return
              void run(()=>repository.cancelDishCompletion!(prep.id)).catch(()=>{})
            }}>완료 기록 정정</button>
          </div>
        )}
        {prep?.status!=='completed' && <>
          <div className="dish-planner__controls">
            {canAdd && (
              <button type="button" onClick={()=>setPanel(cardKey,'frozen')} disabled={busy}>+ 냉동 큐브 담기</button>
            )}
            {canAdd && (prep || repository.createFreshDishPreparation) && (
              <button type="button" onClick={()=>setPanel(cardKey,'fresh')} disabled={busy}>+ 오늘 만든 큐브</button>
            )}
            {canComplete && (
              <button type="button" onClick={()=>setPanel(cardKey,'complete')} disabled={busy}>먹은 기록 완료</button>
            )}
            {prep && quantity===0 && (
              <button type="button" disabled={busy} onClick={()=>{
                if(!repository.cancelEmptyDishPreparation)return
                void run(()=>repository.cancelEmptyDishPreparation!(prep.id)).catch(()=>{})
              }}>빈 식기 취소</button>
            )}
          </div>
          {canAdd && opening && editMode==='frozen' && (
            <FrozenPicker batches={batches} servingOn={servingOn} submitting={busy}
              onCancel={()=>setEditMode(null)}
              onSubmit={selected=>executePrepare(slot,servingOn,selected,prep)}/>
          )}
          {canAdd && opening && editMode==='fresh' && (prep || repository.createFreshDishPreparation) && (
            <FreshPicker submitting={busy} onCancel={()=>setEditMode(null)}
              onSubmit={draft=>prep
                ? run(()=>repository.addFreshDishItem!(prep.id,draft))
                : run(()=>repository.createFreshDishPreparation!(servingOn,slot,draft))}/>
          )}
          {canComplete && opening && editMode==='complete' && (
            <MealCompletion preparation={prep} submitting={busy}
              onCancel={()=>setEditMode(null)}
              onComplete={draft=>run(()=>repository.completeDishPreparation!(prep.id,draft))}/>
          )}
        </>}
      </article>
    )
  }

  return (
    <section className="dish-planner" aria-label="식기에 담기">
      <header className="dish-planner__heading">
        <span>전날 미리 식기에 담고, 다음 날 먹은 기록을 남겨요</span>
        <h1>식기에 담기</h1>
      </header>
      <p className="dish-planner__explain">
        이 화면은 다음 날 먹일 냉동 큐브를 미리 꺼내 냉장 해동할 때 사용해요.
        당일 바로 데워 먹였다면 냉동실의 큐브에서 ‘먹었어요’를 눌러 기록하세요.
        미리 담았다고 먹은 기록이 자동 등록되지는 않아요.
      </p>
      {incorrectDatePreparations.length>0 && (
        <section className="dish-planner__date-correction" aria-label="식기 날짜 정정">
          <strong>어제 날짜로 저장된 미완료 식기가 있어요.</strong>
          <p>어젯밤 오늘 먹일 큐브를 담았는데 어제 식사로 잘못 저장했다면, 해당 끼니만 오늘로 정정하세요. 재고는 다시 차감하지 않아요. 어제 실제 먹였다면 정정하지 말고 어제 섭취 시각을 입력하세요.</p>
          {incorrectDatePreparations.map(prep=>(
            <div className="dish-actions" key={prep.id}>
              <span>{SLOT_LABELS[prep.mealSlot]} · {prep.servingOn}</span>
              <button type="button" disabled={busy || !repository.correctDishServingDate}
                onClick={()=>void correctDate(prep)}>오늘 식사로 날짜 정정</button>
            </div>
          ))}
        </section>
      )}
      {loading && <p>식기에 담은 기록을 불러오는 중이에요.</p>}
      {error && <p role="alert" className="dish-planner__error">{error}</p>}
      <section className="dish-planner__section" aria-label="먹은 기록을 기다리는 식기">
        <header className="dish-planner__section-heading">
          <h2>먹은 기록 기다리는 식기</h2>
          <small>식사 예정일이 지났거나 오늘인 미완료 식기 · {waitingPreparations.length}끼니</small>
        </header>
        {waitingPreparations.length===0
          ? <p className="dish-planner__empty">아직 먹은 기록을 기다리는 식기가 없어요.</p>
          : <div className="dish-planner__slots">
            {waitingPreparations.map(prep=>renderDishCard(prep.mealSlot,prep.servingOn,prep,'waiting'))}
          </div>}
      </section>
      <section className="dish-planner__section" aria-label="다음 날 식기 미리 담기">
        <header className="dish-planner__section-heading">
          <h2>다음 날 먹일 식기 미리 담기</h2>
          <small>식사 예정일 {tomorrow} · 하루치만 준비해요</small>
        </header>
        <div className="dish-planner__slots">
          {SLOTS.map(slot=>{
            const prep=dishData.preparations.find(p=>p.servingOn===tomorrow && p.mealSlot===slot && p.status!=='cancelled')
            return renderDishCard(slot,tomorrow,prep,'prepare')
          })}
        </div>
      </section>
      {futureLegacyPreparations.length>0 && (
        <section className="dish-planner__section" aria-label="이전에 등록된 다른 날짜 식기">
          <header className="dish-planner__section-heading">
            <h2>기존에 등록된 다른 날짜 식기</h2>
            <small>기존 기록을 보존하기 위해 표시해요. 새로 여러 날치를 준비하는 기능은 제공하지 않아요.</small>
          </header>
          <div className="dish-planner__slots">
            {futureLegacyPreparations.map(prep=>renderDishCard(prep.mealSlot,prep.servingOn,prep,'legacy'))}
          </div>
        </section>
      )}
    </section>
  )
}
