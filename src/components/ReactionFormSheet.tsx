import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ConsumptionRecord, FoodReaction } from '../types'
import { Icon } from './Icon'

export interface ReactionFormSheetProps {
  open?: boolean
  record: ConsumptionRecord | null
  onClose: () => void
  onSave: (reaction: FoodReaction | null, note: string) => Promise<void>
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

export function ReactionFormSheet({
  open,
  record,
  onClose,
  onSave,
}: ReactionFormSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const firstOptionRef = useRef<HTMLButtonElement>(null)
  const [reaction, setReaction] = useState<FoodReaction | null>(record?.reaction ?? null)
  const [note, setNote] = useState(record?.reactionNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isOpen = open ?? Boolean(record)

  useEffect(() => {
    if (!isOpen || !record) return
    setReaction(record.reaction)
    setNote(record.reactionNote)
    setSaving(false)
    setError('')

    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => firstOptionRef.current?.focus(), 0)
    }
  }, [isOpen, record])

  useEffect(() => {
    if (!isOpen && dialogRef.current?.open) dialogRef.current.close()
  }, [isOpen])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!record) return

    const trimmedNote = note.trim()
    if (trimmedNote.length > 100) {
      setError('반응 메모는 100자 이하로 적어 주세요.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave(reaction, trimmedNote)
      dialogRef.current?.close()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '반응을 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !record) return null

  return (
    <dialog
      aria-labelledby="reaction-form-title"
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
      <form className="sheet reaction-sheet" onSubmit={handleSubmit}>
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">먹은 뒤의 모습도 차곡차곡</span>
            <h2 id="reaction-form-title">{record.cubeName} 반응</h2>
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
          <fieldset className="field reaction-field">
            <legend>아기가 어떻게 먹었나요?</legend>
            <div className="reaction-options" role="radiogroup">
              {REACTION_OPTIONS.map((option, index) => {
                const selected = reaction === option.value
                const className = option.value ?? 'none'

                return (
                  <button
                    aria-checked={selected}
                    className={`reaction-option reaction-option--${className} ${selected ? 'is-selected' : ''}`}
                    disabled={saving}
                    key={option.value ?? 'none'}
                    onClick={() => setReaction(option.value)}
                    ref={index === 0 ? firstOptionRef : undefined}
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
              disabled={saving}
              maxLength={100}
              onChange={(event) => setNote(event.target.value)}
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
        </div>

        <footer className="sheet__footer">
          <button className="primary-button sheet__save" disabled={saving} type="submit">
            {saving ? <span className="button-spinner" /> : <Icon name="check" size={20} />}
            {saving ? '저장 중' : '반응 저장'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
