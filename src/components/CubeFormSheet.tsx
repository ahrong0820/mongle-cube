import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  calculateExpiresAt,
  formatDateTime,
  fromSeoulDateTimeInput,
  toSeoulDateTimeInput,
} from '../lib/date'
import type { CubeBatch, CubeCategory, CubeDraft, CubeUnit } from '../types'
import { Icon } from './Icon'

interface CubeFormSheetProps {
  open: boolean
  initial: CubeBatch | null
  onClose: () => void
  onSave: (draft: CubeDraft) => Promise<void>
  onDelete: (() => Promise<void>) | null
}

interface FormState {
  name: string
  category: CubeCategory
  quantity: string
  preparedLocal: string
  unitAmount: string
  unit: CubeUnit
  memo: string
}

const CATEGORY_OPTIONS: { value: CubeCategory; label: string }[] = [
  { value: 'base', label: '베이스' },
  { value: 'topping', label: '토핑' },
  { value: 'snack', label: '간식' },
  { value: 'other', label: '기타' },
]

function getInitialState(initial: CubeBatch | null): FormState {
  return {
    name: initial?.name ?? '',
    category: initial?.category ?? 'topping',
    quantity: String(initial?.quantity ?? 1),
    preparedLocal: toSeoulDateTimeInput(initial?.preparedAt ?? new Date()),
    unitAmount: initial?.unitAmount ? String(initial.unitAmount) : '',
    unit: initial?.unit ?? 'g',
    memo: initial?.memo ?? '',
  }
}

export function CubeFormSheet({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
}: CubeFormSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>(() => getInitialState(initial))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(getInitialState(initial))
    setError('')
    setSaving(false)
    setConfirmingDelete(false)

    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => nameRef.current?.focus(), 0)
    }
  }, [initial, open])

  useEffect(() => {
    if (!open && dialogRef.current?.open) dialogRef.current.close()
  }, [open])

  const expiryPreview = useMemo(() => {
    try {
      return formatDateTime(calculateExpiresAt(fromSeoulDateTimeInput(form.preparedLocal)))
    } catch {
      return '날짜를 확인해 주세요'
    }
  }, [form.preparedLocal])

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const changeQuantity = (delta: number) => {
    const current = Number.parseInt(form.quantity, 10)
    const next = Math.min(999, Math.max(0, (Number.isNaN(current) ? 0 : current) + delta))
    setField('quantity', String(next))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    const name = form.name.trim()
    const quantity = Number(form.quantity)
    const unitAmount = form.unitAmount ? Number(form.unitAmount) : null

    if (!name) return setError('큐브 이름을 입력해 주세요.')
    if (name.length > 40) return setError('큐브 이름은 40자 이하로 입력해 주세요.')
    if (!CATEGORY_OPTIONS.some((option) => option.value === form.category)) {
      return setError('재료 역할을 골라 주세요.')
    }
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
      return setError('만든 개수는 0~999 사이의 정수로 입력해 주세요.')
    }
    if (unitAmount !== null && (!Number.isFinite(unitAmount) || unitAmount <= 0)) {
      return setError('1개 용량은 0보다 큰 숫자로 입력해 주세요.')
    }
    if (form.memo.length > 100) return setError('메모는 100자 이하로 입력해 주세요.')

    let preparedAt: string
    try {
      preparedAt = fromSeoulDateTimeInput(form.preparedLocal)
    } catch (dateError) {
      return setError(dateError instanceof Error ? dateError.message : '제작일을 확인해 주세요.')
    }

    if (new Date(preparedAt).getTime() > Date.now() + 5 * 60 * 1000) {
      return setError('제작일은 현재보다 미래일 수 없어요.')
    }

    setSaving(true)
    try {
      await onSave({
        name,
        category: form.category,
        preparedAt,
        quantity,
        unitAmount,
        unit: unitAmount === null ? null : form.unit,
        memo: form.memo.trim(),
      })
      dialogRef.current?.close()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setSaving(true)
    setError('')
    try {
      await onDelete()
      dialogRef.current?.close()
      onClose()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '삭제하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <dialog
      aria-labelledby="cube-form-title"
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
      <form className="sheet" onSubmit={handleSubmit}>
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">{initial ? '큐브 정보 다듬기' : '냉동실에 새로 담기'}</span>
            <h2 id="cube-form-title">{initial ? '큐브 수정' : '큐브 추가'}</h2>
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
            <span>큐브 이름 <b>필수</b></span>
            <input
              autoComplete="off"
              maxLength={40}
              onChange={(event) => setField('name', event.target.value)}
              placeholder="예: 당근, 소고기브로콜리"
              ref={nameRef}
              value={form.name}
            />
          </label>

          <fieldset className="field meal-slot-field cube-category-field">
            <legend>
              재료 역할 <b>필수</b>
            </legend>
            <div className="meal-slot-options cube-category-options">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  aria-pressed={form.category === option.value}
                  className={form.category === option.value ? 'is-selected' : ''}
                  key={option.value}
                  onClick={() => setField('category', option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <span>현재 개수 <b>필수</b></span>
            <div className="form-stepper">
              <button
                aria-label="개수 1개 줄이기"
                onClick={() => changeQuantity(-1)}
                type="button"
              >
                <Icon name="minus" />
              </button>
              <input
                aria-label="현재 개수"
                inputMode="numeric"
                max="999"
                min="0"
                onChange={(event) => setField('quantity', event.target.value)}
                type="number"
                value={form.quantity}
              />
              <button
                aria-label="개수 1개 늘리기"
                onClick={() => changeQuantity(1)}
                type="button"
              >
                <Icon name="plus" />
              </button>
            </div>
          </div>

          <label className="field">
            <span>제작 날짜와 시간 <b>필수</b></span>
            <div className="input-with-icon">
              <Icon name="calendar" size={19} />
              <input
                onChange={(event) => setField('preparedLocal', event.target.value)}
                type="datetime-local"
                value={form.preparedLocal}
              />
            </div>
          </label>

          <div className="expiry-preview">
            <Icon name="snowflake" size={20} />
            <div>
              <span>가정 기준 냉동 14일</span>
              <strong>{expiryPreview}까지</strong>
            </div>
          </div>

          <details className="optional-fields" open={Boolean(initial?.unitAmount || initial?.memo)}>
            <summary>
              선택 정보
              <Icon name="chevron" size={18} />
            </summary>
            <div className="optional-fields__body">
              <div className="field">
                <span>1개 용량</span>
                <div className="unit-row">
                  <input
                    aria-label="1개 용량"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setField('unitAmount', event.target.value)}
                    placeholder="예: 20"
                    type="number"
                    value={form.unitAmount}
                  />
                  <div className="unit-switch" role="group" aria-label="용량 단위">
                    {(['g', 'mL'] as const).map((unit) => (
                      <button
                        aria-pressed={form.unit === unit}
                        className={form.unit === unit ? 'is-selected' : ''}
                        onClick={() => setField('unit', unit)}
                        type="button"
                        key={unit}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="field">
                <span>메모</span>
                <textarea
                  maxLength={100}
                  onChange={(event) => setField('memo', event.target.value)}
                  placeholder="재료나 큐브 크기를 적어두세요"
                  rows={2}
                  value={form.memo}
                />
                <small>{form.memo.length}/100</small>
              </label>
            </div>
          </details>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {initial && confirmingDelete && (
            <div className="delete-confirm" role="alert">
              <p>이 큐브를 목록에서 완전히 삭제할까요?</p>
              <div>
                <button onClick={() => setConfirmingDelete(false)} type="button">
                  취소
                </button>
                <button className="danger-button" onClick={handleDelete} type="button">
                  삭제
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="sheet__footer">
          {initial && !confirmingDelete && (
            <button
              aria-label={`${initial.name} 삭제하기`}
              className="delete-button"
              disabled={saving}
              onClick={() => setConfirmingDelete(true)}
              type="button"
            >
              <Icon name="trash" size={19} />
              삭제
            </button>
          )}
          <button className="primary-button sheet__save" disabled={saving} type="submit">
            {saving ? <span className="button-spinner" /> : <Icon name="check" size={20} />}
            {saving ? '저장 중' : initial ? '수정 저장' : '큐브 저장'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
