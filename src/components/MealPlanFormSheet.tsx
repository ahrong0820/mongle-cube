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
  batchId: string
  quantity: string
}

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

function getInitialState(
  batches: CubeBatch[],
  initialDate: string,
  initialMealSlot?: MealSlot,
): FormState {
  const firstBatch = batches.find((batch) => batch.quantity > 0) ?? batches[0]
  return {
    plannedFor: validDateOrToday(initialDate),
    mealSlot: initialMealSlot ?? 'breakfast',
    batchId: firstBatch?.id ?? '',
    quantity: '1',
  }
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
    getInitialState(batches, initialDate, initialMealSlot),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(getInitialState(batches, initialDate, initialMealSlot))
    setSaving(false)
    setError('')

    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => dateRef.current?.focus(), 0)
    }
    // Opening the sheet intentionally snapshots the current inventory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate, initialMealSlot, open])

  useEffect(() => {
    if (!open && dialogRef.current?.open) dialogRef.current.close()
  }, [open])

  useEffect(() => {
    if (!open || batches.length === 0) return
    if (!batches.some((batch) => batch.id === form.batchId)) {
      const firstBatch = batches.find((batch) => batch.quantity > 0) ?? batches[0]
      setForm((current) => ({ ...current, batchId: firstBatch.id }))
    }
  }, [batches, form.batchId, open])

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === form.batchId) ?? null,
    [batches, form.batchId],
  )
  const plannedQuantity = Number.parseInt(form.quantity, 10)
  const stockShort = Boolean(
    selectedBatch &&
      Number.isInteger(plannedQuantity) &&
      plannedQuantity > selectedBatch.quantity,
  )

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const changeQuantity = (amount: number) => {
    const current = Number.parseInt(form.quantity, 10)
    const next = Math.min(12, Math.max(1, (Number.isNaN(current) ? 1 : current) + amount))
    setField('quantity', String(next))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    const quantity = Number(form.quantity)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.plannedFor)) {
      return setError('식단 날짜를 확인해 주세요.')
    }
    if (!MEAL_SLOTS.includes(form.mealSlot)) {
      return setError('식사 시간을 골라 주세요.')
    }
    if (!selectedBatch) return setError('식단에 담을 큐브를 골라 주세요.')
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 12) {
      return setError('큐브는 한 번에 1~12개까지 계획할 수 있어요.')
    }

    setSaving(true)
    try {
      await onSave({
        batchId: selectedBatch.id,
        plannedFor: form.plannedFor,
        mealSlot: form.mealSlot,
        quantity,
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
      <form className="sheet meal-plan-sheet" onSubmit={handleSubmit}>
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">미리 담아두는 우리 아기 한 끼</span>
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

          <label className="field">
            <span>
              큐브 <b>필수</b>
            </span>
            <select
              disabled={batches.length === 0}
              onChange={(event) => setField('batchId', event.target.value)}
              value={form.batchId}
            >
              {batches.length === 0 ? (
                <option value="">먼저 큐브를 등록해 주세요</option>
              ) : (
                batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name} · {CATEGORY_LABELS[batch.category]} · 재고 {batch.quantity}개
                  </option>
                ))
              )}
            </select>
          </label>

          {selectedBatch && (
            <div className={`cube-choice-preview ${stockShort ? 'is-short' : ''}`}>
              <span aria-hidden="true" />
              <div>
                <strong>{selectedBatch.name}</strong>
                <small>
                  {selectedBatch.unitAmount && selectedBatch.unit
                    ? `1개 ${selectedBatch.unitAmount}${selectedBatch.unit}`
                    : '용량 미입력'}
                </small>
              </div>
              <b>재고 {selectedBatch.quantity}개</b>
            </div>
          )}

          <div className="field">
            <span>
              계획할 개수 <b>필수</b>
            </span>
            <div className="form-stepper">
              <button
                aria-label="계획 개수 1개 줄이기"
                disabled={saving}
                onClick={() => changeQuantity(-1)}
                type="button"
              >
                <Icon name="minus" />
              </button>
              <input
                aria-label="계획할 개수"
                inputMode="numeric"
                max="12"
                min="1"
                onChange={(event) => setField('quantity', event.target.value)}
                type="number"
                value={form.quantity}
              />
              <button
                aria-label="계획 개수 1개 늘리기"
                disabled={saving}
                onClick={() => changeQuantity(1)}
                type="button"
              >
                <Icon name="plus" />
              </button>
            </div>
          </div>

          {stockShort && selectedBatch && (
            <p className="stock-hint" role="status">
              <Icon name="snowflake" size={17} />
              현재 재고보다 {plannedQuantity - selectedBatch.quantity}개 많아요. 계획은 저장할 수
              있지만 먹일 때 재고가 필요해요.
            </p>
          )}

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
            {saving ? '저장 중' : `${plannedQuantity || 0}개 계획하기`}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
