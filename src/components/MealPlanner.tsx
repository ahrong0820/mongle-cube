import { useMemo, useState } from 'react'
import { getSeoulDateKey } from '../lib/date'
import type {
  ConsumptionRecord,
  CubeBatch,
  MealPlanItem,
  MealSlot,
} from '../types'
import { Icon } from './Icon'

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  snack: '간식',
}

const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const REACTION_LABELS = {
  liked: '잘 먹음',
  okay: '보통',
  disliked: '거부',
  watch: '관찰 필요',
} as const

export interface MealPlannerProps {
  batches: CubeBatch[]
  items: MealPlanItem[]
  records?: ConsumptionRecord[]
  loading: boolean
  pendingIds?: ReadonlySet<string>
  selectedDate?: string
  onSelectDate?: (date: string) => void
  onAdd: (plannedFor: string, mealSlot?: MealSlot) => void
  onComplete: (item: MealPlanItem) => void
  onRemove: (item: MealPlanItem) => void
  onEditReaction?: (record: ConsumptionRecord) => void
}

interface DateParts {
  date: Date
  key: string
}

function parseDateKey(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  const key = formatDateKey(date)
  return key === value ? { date, key } : null
}

function formatDateKey(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDateKey(value: string, amount: number) {
  const parsed = parseDateKey(value)
  const date = parsed?.date ?? new Date(`${getSeoulDateKey(new Date())}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return formatDateKey(date)
}

function getWeek(value: string) {
  const parsed = parseDateKey(value)
  const selected = parsed?.date ?? new Date(`${getSeoulDateKey(new Date())}T00:00:00Z`)
  const mondayOffset = (selected.getUTCDay() + 6) % 7
  const monday = new Date(selected)
  monday.setUTCDate(monday.getUTCDate() - mondayOffset)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setUTCDate(monday.getUTCDate() + index)
    return date
  })
}

function formatSelectedDate(value: string) {
  const parsed = parseDateKey(value)
  if (!parsed) return value
  const date = parsed.date
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 ${WEEKDAY_LABELS[date.getUTCDay()]}요일`
}

function formatUnit(item: MealPlanItem) {
  return item.unitAmount && item.unit ? `1개 · ${item.unitAmount}${item.unit}` : '1개'
}

function sortItems(items: MealPlanItem[]) {
  return [...items].sort((a, b) => {
    const createdDifference = a.createdAt.localeCompare(b.createdAt)
    if (createdDifference !== 0) return createdDifference
    return a.id.localeCompare(b.id)
  })
}

export function MealPlanner({
  batches,
  items,
  records = [],
  loading,
  pendingIds = new Set<string>(),
  selectedDate: controlledDate,
  onSelectDate,
  onAdd,
  onComplete,
  onRemove,
  onEditReaction,
}: MealPlannerProps) {
  const [uncontrolledDate, setUncontrolledDate] = useState(() => getSeoulDateKey(new Date()))
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  const today = getSeoulDateKey(new Date())
  const selectedDate = controlledDate ?? uncontrolledDate
  const selectDate = (date: string) => {
    if (controlledDate === undefined) setUncontrolledDate(date)
    onSelectDate?.(date)
  }
  const week = useMemo(() => getWeek(selectedDate), [selectedDate])
  const batchesById = useMemo(
    () => new Map(batches.map((batch) => [batch.id, batch])),
    [batches],
  )
  const recordsById = useMemo(
    () => new Map(records.map((record) => [record.id, record])),
    [records],
  )
  const selectedItems = useMemo(
    () => sortItems(items.filter((item) => item.plannedFor === selectedDate)),
    [items, selectedDate],
  )
  const pendingCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of selectedItems) {
      if (!item.consumptionRecordId) {
        counts.set(item.batchId, (counts.get(item.batchId) ?? 0) + 1)
      }
    }
    return counts
  }, [selectedItems])
  const stockWarnings = useMemo(
    () =>
      [...pendingCounts.entries()]
        .map(([batchId, planned]) => {
          const batch = batchesById.get(batchId)
          return {
            batchId,
            name:
              batch?.name ??
              selectedItems.find((item) => item.batchId === batchId)?.cubeName ??
              '알 수 없는 큐브',
            planned,
            available: batch?.quantity ?? 0,
            missing: !batch,
          }
        })
        .filter((warning) => warning.missing || warning.planned > warning.available),
    [batchesById, pendingCounts, selectedItems],
  )

  return (
    <section className="meal-planner" aria-labelledby="meal-planner-title">
      <header className="meal-planner__heading">
        <div>
          <span className="eyebrow">한 끼씩 가볍게 준비해요</span>
          <h1 id="meal-planner-title">식단 플래너</h1>
        </div>
        <button
          className="primary-button meal-planner__add"
          onClick={() => onAdd(selectedDate)}
          type="button"
        >
          <Icon name="plus" size={18} />
          식단 추가
        </button>
      </header>

      <div className="week-picker">
        <div className="week-picker__controls">
          <button
            aria-label="이전 주 보기"
            className="icon-button week-picker__previous"
            onClick={() => selectDate(shiftDateKey(selectedDate, -7))}
            type="button"
          >
            <Icon name="chevron" size={18} />
          </button>
          <strong>{formatSelectedDate(selectedDate)}</strong>
          <button
            aria-label="다음 주 보기"
            className="icon-button"
            onClick={() => selectDate(shiftDateKey(selectedDate, 7))}
            type="button"
          >
            <Icon name="chevron" size={18} />
          </button>
        </div>

        <div className="week-picker__days" role="group" aria-label="식단 날짜 선택">
          {week.map((date) => {
            const key = formatDateKey(date)
            const isToday = key === today
            const isSelected = key === selectedDate

            return (
              <button
                aria-label={`${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 ${WEEKDAY_LABELS[date.getUTCDay()]}요일${isToday ? ', 오늘' : ''}`}
                aria-pressed={isSelected}
                className={`${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`.trim()}
                key={key}
                onClick={() => selectDate(key)}
                type="button"
              >
                <span>{WEEKDAY_LABELS[date.getUTCDay()]}</span>
                <strong>{date.getUTCDate()}</strong>
                {isToday && <small>오늘</small>}
              </button>
            )
          })}
        </div>
      </div>

      {stockWarnings.length > 0 && (
        <aside className="stock-warning" role="status">
          <Icon name="snowflake" size={19} />
          <div>
            <strong>예정한 만큼 재고가 없어요</strong>
            <ul>
              {stockWarnings.map((warning) => (
                <li key={warning.batchId}>
                  {warning.name} · 예정 {warning.planned}개 / 재고{' '}
                  {warning.missing ? '확인 불가' : `${warning.available}개`}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}

      {loading ? (
        <div className="meal-planner__skeletons" aria-label="식단을 불러오는 중">
          <div />
          <div />
        </div>
      ) : (
        <div className="meal-slot-list">
          {MEAL_SLOTS.map((mealSlot) => {
            const slotItems = selectedItems.filter((item) => item.mealSlot === mealSlot)
            const pendingItems = slotItems.filter((item) => !item.consumptionRecordId)
            const completedItems = slotItems.filter((item) => item.consumptionRecordId)

            return (
              <article className="meal-slot-card" key={mealSlot}>
                <header className="meal-slot-card__header">
                  <div>
                    <span className={`meal-slot-card__dot meal-slot-card__dot--${mealSlot}`} />
                    <h2>{MEAL_SLOT_LABELS[mealSlot]}</h2>
                    <small>
                      {completedItems.length}/{slotItems.length}개 완료
                    </small>
                  </div>
                  <button
                    aria-label={`${MEAL_SLOT_LABELS[mealSlot]} 식단 추가`}
                    onClick={() => onAdd(selectedDate, mealSlot)}
                    type="button"
                  >
                    <Icon name="plus" size={17} />
                    추가
                  </button>
                </header>

                {slotItems.length === 0 ? (
                  <button
                    className="meal-slot-card__empty"
                    onClick={() => onAdd(selectedDate, mealSlot)}
                    type="button"
                  >
                    <span aria-hidden="true">＋</span>
                    아직 계획이 없어요
                  </button>
                ) : (
                  <div className="meal-slot-card__groups">
                    {pendingItems.length > 0 && (
                      <section className="plan-item-group" aria-label="먹일 예정">
                        <header>
                          <strong>예정</strong>
                          <span>{pendingItems.length}개</span>
                        </header>
                        <ul>
                          {pendingItems.map((item) => {
                            const batch = batchesById.get(item.batchId)
                            const pending = pendingIds.has(item.id)
                            const removing = pending
                            const stockShort =
                              !batch ||
                              batch.quantity === 0 ||
                              (pendingCounts.get(item.batchId) ?? 0) > batch.quantity

                            return (
                              <li className="plan-item" key={item.id}>
                                <div className="plan-item__copy">
                                  <span aria-hidden="true" className="plan-item__cube" />
                                  <div>
                                    <strong>{item.cubeName}</strong>
                                    <small>{formatUnit(item)}</small>
                                  </div>
                                </div>
                                <span
                                  className={`plan-item__stock ${stockShort ? 'is-short' : ''}`}
                                >
                                  {!batch
                                    ? '재고 확인 불가'
                                    : batch.quantity === 0
                                      ? '재고 없음'
                                      : stockShort
                                        ? `재고 ${batch.quantity}개 · 부족`
                                        : `재고 ${batch.quantity}개`}
                                </span>

                                {confirmingRemoveId === item.id ? (
                                  <div className="plan-item__confirm" role="alert">
                                    <span>이 1개를 뺄까요?</span>
                                    <button
                                      disabled={removing}
                                      onClick={() => setConfirmingRemoveId(null)}
                                      type="button"
                                    >
                                      취소
                                    </button>
                                    <button
                                      className="danger-button"
                                      disabled={removing}
                                      onClick={() => {
                                        onRemove(item)
                                        setConfirmingRemoveId(null)
                                      }}
                                      type="button"
                                    >
                                      {removing ? '빼는 중' : '1개 빼기'}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="plan-item__actions">
                                    <button
                                      aria-label={`${item.cubeName} 예정 1개 삭제`}
                                      className="plan-item__remove"
                                      disabled={pending || removing}
                                      onClick={() => setConfirmingRemoveId(item.id)}
                                      type="button"
                                    >
                                      <Icon name="trash" size={16} />
                                    </button>
                                    <button
                                      className="plan-item__complete"
                                      disabled={pending || removing || !batch || batch.quantity <= 0}
                                      onClick={() => onComplete(item)}
                                      type="button"
                                    >
                                      {pending ? (
                                        <span className="mini-spinner" />
                                      ) : (
                                        <Icon name="check" size={17} />
                                      )}
                                      {pending ? '기록 중' : '먹었어요'}
                                    </button>
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    )}

                    {completedItems.length > 0 && (
                      <section className="plan-item-group is-completed" aria-label="먹이기 완료">
                        <header>
                          <strong>완료</strong>
                          <span>{completedItems.length}개</span>
                        </header>
                        <ul>
                          {completedItems.map((item) => {
                            const record = item.consumptionRecordId
                              ? recordsById.get(item.consumptionRecordId)
                              : undefined

                            return (
                              <li className="plan-item is-completed" key={item.id}>
                                <div className="plan-item__copy">
                                  <span aria-hidden="true" className="plan-item__check">
                                    <Icon name="check" size={15} />
                                  </span>
                                  <div>
                                    <strong>{item.cubeName}</strong>
                                    <small>{formatUnit(item)}</small>
                                  </div>
                                </div>
                                {record && onEditReaction && (
                                  <button
                                    className={`plan-item__reaction ${record.reaction ? 'has-reaction' : ''}`}
                                    onClick={() => onEditReaction(record)}
                                    type="button"
                                  >
                                    {record.reaction
                                      ? REACTION_LABELS[record.reaction]
                                      : '반응 남기기'}
                                  </button>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
