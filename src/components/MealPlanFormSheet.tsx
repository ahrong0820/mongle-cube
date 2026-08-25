import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { getSeoulDateKey } from '../lib/date'
import type { CubeBatch, MealPlanDraft, MealSlot } from '../types'
import { Icon } from './Icon'
import { MEAL_SLOT_LABELS } from './MealPlanner'

export interface MealPlanFormSheetProps {
  open: boolean
  batches: CubeBatch[]
  initialDate: string
  initialMealSlot?: MealSlot
  onClose: () => void
  onSave: (draft: MealPlanDraft) => Promise<void>
}

interface FormState {
  plannedFor: string
  mealSlot: MealSlot
  quantitiesByBatchId: Record<string, string>
}

const MAX_TOTAL_QUANTITY = 12
const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
const CATEGORY_LABELS: Record<CubeBatch['category'], string> = {
  base: '베이스',
  topping: '토핑',
  snack: '간식',
  other: '기타',
}

function validDateOrToday(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`)
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
      return value
    }
  }
  return getSeoulDateKey(new Date())
}

function getInitialState(initialDate: string, initialMealSlot?: MealSlot): FormState {
  return {
    plannedFor: validDateOrToday(initialDate),
    mealSlot: initialMealSlot ?? 'breakfast',
    quantitiesByBatchId: {},
  }
}

function getPlannedQuantity(value: string | undefined) {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 0
}

export function MealPlanFormSheet({
  open,
  batches,
  initialDate,
  initialMealSlot,
  onClose,
  onSave,
}: MealPlanFormSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>(() =>
    getInitialState(initialDate, initialMealSlot),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(getInitialState(initialDate, initialMealSlot))
    setSaving(false)
    setError('')

    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => dateRef.current?.focus(), 0)
    }
  }, [initialDate, initialMealSlot, open])

  useEffect(() => {
    if (!open && dialogRef.current?.open) dialogRef.current.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    const availableIds = new Set(batches.map((batch) => batch.id))
    setForm((current) => {
      const nextEntries = Object.entries(current.quantitiesByBatchId).filter(([batchId]) =>
        availableIds.has(batchId),
      )
      if (nextEntries.length === Object.keys(current.quantitiesByBatchId).length) return current
      return { ...current, quantitiesByBatchId: Object.fromEntries(nextEntries) }
    })
  }, [batches, open])

  const selectedBatches = useMemo(
    () =>
      batches.filter((batch) =>
        Object.prototype.hasOwnProperty.call(form.quantitiesByBatchId, batch.id),
      ),
    [batches, form.quantitiesByBatchId],
  )
  const totalPlannedQuantity = selectedBatches.reduce(
    (total, batch) => total + getPlannedQuantity(form.quantitiesByBatchId[batch.id]),
    0,
  )

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const toggleBatch = (batchId: string) => {
    setError('')
    const alreadySelected = Object.prototype.hasOwnProperty.call(
      form.quantitiesByBatchId,
      batchId,
    )
    if (!alreadySelected && totalPlannedQuantity >= MAX_TOTAL_QUANTITY) {
      setError(`한 끼에는 큐브를 총 ${MAX_TOTAL_QUANTITY}개까지 계획할 수 있어요.`)
      return
    }

    setForm((current) => {
      const next = { ...current.quantitiesByBatchId }
      if (Object.prototype.hasOwnProperty.call(next, batchId)) {
        delete next[batchId]
      } else {
        next[batchId] = '1'
      }
      return { ...current, quantitiesByBatchId: next }
    })
  }

  const setBatchQuantity = (batchId: string, value: string) => {
    setError('')
    setForm((current) => ({
      ...current,
      quantitiesByBatchId: {
        ...current.quantitiesByBatchId,
        [batchId]: value,
      },
    }))
  }

  const changeBatchQuantity = (batchId: string, amount: number) => {
    setError('')
    setForm((current) => {
      const currentQuantity = getPlannedQuantity(current.quantitiesByBatchId[batchId]) || 1
      const otherTotal = Object.entries(current.quantitiesByBatchId).reduce(
        (total, [currentBatchId, quantity]) =>
          currentBatchId === batchId ? total : total + getPlannedQuantity(quantity),
        0,
      )
      const maximum = Math.max(1, MAX_TOTAL_QUANTITY - otherTotal)
      const nextQuantity = Math.min(maximum, Math.max(1, currentQuantity + amount))
      return {
        ...current,
        quantitiesByBatchId: {
          ...current.quantitiesByBatchId,
          [batchId]: String(nextQuantity),
        },
      }
    })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.plannedFor)) {
      return setError('식단 날짜를 확인해 주세요.')
    }
    if (!MEAL_SLOTS.includes(form.mealSlot)) {
      return setError('식사 시간을 골라 주세요.')
    }
    if (selectedBatches.length === 0) {
      return setError('식단에 담을 큐브를 하나 이상 골라 주세요.')
    }

    const selections = selectedBatches.map((batch) => ({
      batchId: batch.id,
      quantity: Number(form.quantitiesByBatchId[batch.id]),
    }))
    if (
      selections.some(
        (selection) =>
          !Number.isInteger(selection.quantity) ||
          selection.quantity < 1,
      )
    ) {
      return setError('각 큐브의 개수는 1개 이상의 정수로 입력해 주세요.')
    }
    if (
      selections.reduce((total, selection) => total + selection.quantity, 0) >
      MAX_TOTAL_QUANTITY
    ) {
      return setError(`한 끼에는 큐브를 총 ${MAX_TOTAL_QUANTITY}개까지 계획할 수 있어요.`)
    }

    setSaving(true)
    try {
      await onSave({
        plannedFor: form.plannedFor,
        mealSlot: form.mealSlot,
        selections,
      })
      dialogRef.current?.close()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '식단을 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <dialog
      aria-labelledby="meal-plan-form-title"
      className="sheet-dialog"
      onCancel={(event) => {
        event.preventDefault()
        if (!saving) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current && !saving) onClose()
      }}
      ref={dialogRef}
    >
      <form className="sheet meal-plan-sheet" noValidate onSubmit={handleSubmit}>
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">한 끼에 여러 큐브를 함께 담아요</span>
            <h2 id="meal-plan-form-title">식단 추가</h2>
          </div>
          <button
            aria-label="닫기"
            className="icon-button"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="sheet__content">
          <label className="field">
            <span>
              날짜 <b>필수</b>
            </span>
            <div className="input-with-icon">
              <Icon name="calendar" size={19} />
              <input
                onChange={(event) => setField('plannedFor', event.target.value)}
                ref={dateRef}
                type="date"
                value={form.plannedFor}
              />
            </div>
          </label>

          <fieldset className="field meal-slot-field">
            <legend>
              끼니 <b>필수</b>
            </legend>
            <div className="meal-slot-options">
              {MEAL_SLOTS.map((mealSlot) => (
                <button
                  aria-pressed={form.mealSlot === mealSlot}
                  className={form.mealSlot === mealSlot ? 'is-selected' : ''}
                  key={mealSlot}
                  onClick={() => setField('mealSlot', mealSlot)}
                  type="button"
                >
                  {MEAL_SLOT_LABELS[mealSlot]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="field meal-plan-cube-field">
            <legend>
              큐브 <b>여러 종류 선택 가능</b>
            </legend>
            <p className="meal-plan-cube-field__guide">
              먹일 큐브를 고르고 종류마다 개수를 정해 주세요. 한 끼에 총 12개까지 담을 수
              있어요.
            </p>

            {batches.length === 0 ? (
              <p className="meal-plan-cube-field__empty">먼저 냉동실에 큐브를 등록해 주세요.</p>
            ) : (
              <div className="reaction-options meal-plan-cube-options">
                {batches.map((batch) => {
                  const selected = Object.prototype.hasOwnProperty.call(
                    form.quantitiesByBatchId,
                    batch.id,
                  )
                  const quantity = getPlannedQuantity(form.quantitiesByBatchId[batch.id])
                  const stockShort = selected && quantity > batch.quantity
                  const otherTotal = totalPlannedQuantity - quantity
                  const maximumForBatch = Math.max(1, MAX_TOTAL_QUANTITY - otherTotal)

                  return (
                    <section
                      className={`field meal-plan-cube-option${stockShort ? ' is-short' : ''}`}
                      key={batch.id}
                    >
                      <button
                        aria-label={`${batch.name} ${selected ? '선택 해제' : '선택'}`}
                        aria-pressed={selected}
                        className={`reaction-option meal-plan-cube-option__toggle${selected ? ' is-selected' : ''}`}
                        disabled={saving}
                        onClick={() => toggleBatch(batch.id)}
                        type="button"
                      >
                        <span aria-hidden="true">
                          <Icon name={selected ? 'check' : 'plus'} size={17} />
                        </span>
                        <div>
                          <strong>{batch.name}</strong>
                          <small>
                            {CATEGORY_LABELS[batch.category]} ·{' '}
                            {batch.unitAmount && batch.unit
                              ? `1개 ${batch.unitAmount}${batch.unit}`
                              : '용량 미입력'}
                          </small>
                        </div>
                        <small className="meal-plan-cube-option__stock">
                          재고 {batch.quantity}개
                        </small>
                      </button>

                      {selected && (
                        <div className="meal-plan-cube-option__quantity">
                          <span>{batch.name} 계획 개수</span>
                          <div className="form-stepper">
                            <button
                              aria-label={`${batch.name} 계획 개수 1개 줄이기`}
                              disabled={saving || quantity <= 1}
                              onClick={() => changeBatchQuantity(batch.id, -1)}
                              type="button"
                            >
                              <Icon name="minus" />
                            </button>
                            <input
                              aria-label={`${batch.name} 계획할 개수`}
                              inputMode="numeric"
                              max={maximumForBatch}
                              min="1"
                              onChange={(event) =>
                                setBatchQuantity(batch.id, event.target.value)
                              }
                              step="1"
                              type="number"
                              value={form.quantitiesByBatchId[batch.id]}
                            />
                            <button
                              aria-label={`${batch.name} 계획 개수 1개 늘리기`}
                              disabled={saving || totalPlannedQuantity >= MAX_TOTAL_QUANTITY}
                              onClick={() => changeBatchQuantity(batch.id, 1)}
                              type="button"
                            >
                              <Icon name="plus" />
                            </button>
                          </div>
                        </div>
                      )}

                      {stockShort && (
                        <p className="stock-hint meal-plan-cube-option__warning" role="status">
                          <Icon name="snowflake" size={17} />
                          현재 재고보다 {quantity - batch.quantity}개 많아요. 계획은 저장할 수
                          있지만 먹일 때 재고가 필요해요.
                        </p>
                      )}
                    </section>
                  )
                })}
              </div>
            )}
          </fieldset>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="sheet__footer">
          <button
            className="primary-button sheet__save"
            disabled={saving || batches.length === 0}
            type="submit"
          >
            {saving ? <span className="button-spinner" /> : <Icon name="check" size={20} />}
            {saving
              ? '저장 중'
              : selectedBatches.length === 0
                ? '큐브를 골라 주세요'
                : `${selectedBatches.length}종 · 총 ${totalPlannedQuantity}개 계획하기`}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
