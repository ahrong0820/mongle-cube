import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fromSeoulDateTimeInput, toSeoulDateTimeInput } from '../lib/date'
import type {
  ConsumptionRecord,
  ConsumptionRecordUpdate,
  FoodReaction,
} from '../types'
import { Icon } from './Icon'

export interface ConsumptionRecordFormSheetProps {
  open?: boolean
  record: ConsumptionRecord | null
  onClose: () => void
  onSave: (update: ConsumptionRecordUpdate) => Promise<void>
  onDelete: () => Promise<void>
}

interface ReactionOption {
  value: FoodReaction | null
  label: string
  description: string
  symbol: string
}

const REACTION_OPTIONS: ReactionOption[] = [
  {
    value: 'liked',
    label: '잘 먹었어요',
    description: '즐겁게 잘 먹었어요',
    symbol: '♥',
  },
  {
    value: 'okay',
    label: '보통이에요',
    description: '평소처럼 먹었어요',
    symbol: '●',
  },
  {
    value: 'disliked',
    label: '거부했어요',
    description: '잘 먹지 않거나 거부했어요',
    symbol: '–',
  },
  {
    value: 'watch',
    label: '관찰이 필요해요',
    description: '평소와 다른 점을 기록해요',
    symbol: '!',
  },
  {
    value: null,
    label: '선택 안 함',
    description: '반응 표시를 비워둘게요',
    symbol: '○',
  },
]

function formatFixedAmount(record: ConsumptionRecord) {
  return record.unitAmount && record.unit
    ? `1개 · ${record.unitAmount}${record.unit}`
    : '1개'
}

export function ConsumptionRecordFormSheet({
  open,
  record,
  onClose,
  onSave,
  onDelete,
}: ConsumptionRecordFormSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dateTimeRef = useRef<HTMLInputElement>(null)
  const deleteCancelRef = useRef<HTMLButtonElement>(null)
  const [consumedLocal, setConsumedLocal] = useState(() =>
    record ? toSeoulDateTimeInput(record.consumedAt) : '',
  )
  const [reaction, setReaction] = useState<FoodReaction | null>(record?.reaction ?? null)
  const [note, setNote] = useState(record?.reactionNote ?? '')
  const [operation, setOperation] = useState<'saving' | 'deleting' | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')
  const isOpen = open ?? Boolean(record)
  const busy = operation !== null

  useEffect(() => {
    if (!isOpen || !record) return

    setConsumedLocal(toSeoulDateTimeInput(record.consumedAt))
    setReaction(record.reaction)
    setNote(record.reactionNote)
    setOperation(null)
    setConfirmingDelete(false)
    setError('')

    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => dateTimeRef.current?.focus(), 0)
    }
  }, [isOpen, record])

  useEffect(() => {
    if (!isOpen && dialogRef.current?.open) dialogRef.current.close()
  }, [isOpen])

  useEffect(() => {
    if (!confirmingDelete || busy) return
    window.setTimeout(() => deleteCancelRef.current?.focus(), 0)
  }, [busy, confirmingDelete])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!record || busy || confirmingDelete) return

    const trimmedNote = note.trim()
    if (trimmedNote.length > 100) {
      setError('반응 메모는 100자 이하로 적어 주세요.')
      return
    }

    let consumedAt: string
    try {
      consumedAt = fromSeoulDateTimeInput(consumedLocal)
    } catch {
      setError('먹은 날짜와 시간을 확인해 주세요.')
      return
    }

    if (new Date(consumedAt).getTime() > Date.now()) {
      setError('먹은 날짜와 시간은 현재보다 미래일 수 없어요.')
      return
    }

    setOperation('saving')
    setError('')
    try {
      await onSave({ consumedAt, reaction, reactionNote: trimmedNote })
      dialogRef.current?.close()
      onClose()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : '먹은 기록을 수정하지 못했어요.',
      )
    } finally {
      setOperation(null)
    }
  }

  const handleDelete = async () => {
    if (!record || busy || !confirmingDelete) return

    setOperation('deleting')
    setError('')
    try {
      await onDelete()
      dialogRef.current?.close()
      onClose()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : '먹은 기록을 삭제하지 못했어요.',
      )
    } finally {
      setOperation(null)
    }
  }

  if (!isOpen || !record) return null

  return (
    <dialog
      aria-labelledby="consumption-record-form-title"
      className="sheet-dialog"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current && !busy) onClose()
      }}
      ref={dialogRef}
    >
      <form className="sheet reaction-sheet" noValidate onSubmit={handleSubmit}>
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">지난 기록도 차근차근 고쳐요</span>
            <h2 id="consumption-record-form-title">먹은 기록 수정</h2>
          </div>
          <button
            aria-label="먹은 기록 수정 닫기"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="sheet__content">
          <section
            aria-label="먹은 음식과 수량, 수정할 수 없음"
            className="cube-choice-preview"
          >
            <span aria-hidden="true" />
            <div>
              <strong>{record.cubeName}</strong>
              <small>음식과 수량은 바꿀 수 없어요.</small>
            </div>
            <b>{formatFixedAmount(record)}</b>
          </section>

          <label className="field">
            <span>
              먹은 날짜와 시간 <b>필수</b>
            </span>
            <div className="input-with-icon">
              <Icon name="calendar" size={19} />
              <input
                aria-describedby="consumed-at-timezone"
                aria-label="먹은 날짜와 시간, 서울 기준"
                disabled={busy}
                max={toSeoulDateTimeInput(new Date())}
                onChange={(event) => {
                  setConsumedLocal(event.target.value)
                  setError('')
                }}
                ref={dateTimeRef}
                type="datetime-local"
                value={consumedLocal}
              />
            </div>
            <small id="consumed-at-timezone">한국 시간(서울)을 기준으로 저장해요.</small>
          </label>

          <fieldset className="field reaction-field">
            <legend>아기가 어떻게 먹었나요?</legend>
            <div className="reaction-options" role="radiogroup">
              {REACTION_OPTIONS.map((option) => {
                const selected = reaction === option.value
                const className = option.value ?? 'none'

                return (
                  <button
                    aria-checked={selected}
                    className={`reaction-option reaction-option--${className} ${selected ? 'is-selected' : ''}`}
                    disabled={busy}
                    key={option.value ?? 'none'}
                    onClick={() => {
                      setReaction(option.value)
                      setError('')
                    }}
                    role="radio"
                    type="button"
                  >
                    <span aria-hidden="true">{option.symbol}</span>
                    <div>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </div>
                    {selected && <Icon name="check" size={18} />}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {reaction === 'watch' && (
            <aside className="reaction-watch-note" role="note">
              <strong>기록은 관찰을 돕기 위한 메모예요.</strong>
              <p>걱정되는 증상이 있으면 이 기록과 별개로 의료진의 안내를 따라 주세요.</p>
            </aside>
          )}

          <label className="field">
            <span>반응 메모</span>
            <textarea
              aria-label="반응 메모"
              disabled={busy}
              maxLength={100}
              onChange={(event) => {
                setNote(event.target.value)
                setError('')
              }}
              placeholder="예: 한 숟갈 더 달라고 했어요, 입가를 조금 더 살펴보기"
              rows={3}
              value={note}
            />
            <small>{note.length}/100</small>
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {confirmingDelete && (
            <div className="delete-confirm" role="alert">
              <p>
                이 먹은 기록을 삭제할까요? 원래 큐브가 냉동실에 남아 있으면{' '}
                <strong>{record.cubeName} 재고 1개</strong>를 복원해요.
                {record.planItemId && (
                  <span> 연결된 식단은 다시 ‘예정’으로 돌아가요.</span>
                )}
              </p>
              <div>
                <button
                  disabled={busy}
                  onClick={() => {
                    setConfirmingDelete(false)
                    setError('')
                  }}
                  ref={deleteCancelRef}
                  type="button"
                >
                  삭제 취소
                </button>
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={handleDelete}
                  type="button"
                >
                  {operation === 'deleting' ? '삭제 중' : '기록 삭제 확인'}
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="sheet__footer">
          {!confirmingDelete && (
            <button
              aria-label={`${record.cubeName} 먹은 기록 삭제`}
              className="delete-button"
              disabled={busy}
              onClick={() => {
                setConfirmingDelete(true)
                setError('')
              }}
              type="button"
            >
              <Icon name="trash" size={19} />
              기록 삭제
            </button>
          )}
          <button
            className="primary-button sheet__save"
            disabled={busy || confirmingDelete}
            type="submit"
          >
            {operation === 'saving' ? (
              <span className="button-spinner" />
            ) : (
              <Icon name="check" size={20} />
            )}
            {operation === 'saving' ? '저장 중' : '수정 저장'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
