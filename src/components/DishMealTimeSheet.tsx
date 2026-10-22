import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { DishPreparation } from '../data/dishPreparationTypes'
import { formatHistoryTime, fromSeoulDateTimeInput, getSeoulDateKey } from '../lib/date'

interface Props {
  preparation: DishPreparation | null
  onClose: () => void
  onSave: (time: string) => Promise<void>
}

export function DishMealTimeSheet({ preparation, onClose, onSave }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!preparation?.consumedAt) {
      dialogRef.current?.close()
      return
    }
    setTime(formatHistoryTime(preparation.consumedAt))
    setSaving(false)
    setError('')
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [preparation])

  if (!preparation || !preparation.consumedAt) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError('수정할 시간을 확인해 주세요.')
      return
    }
    const next = fromSeoulDateTimeInput(`${getSeoulDateKey(preparation.consumedAt!)}T${time}`)
    if (new Date(next).getTime() > Date.now()) {
      setError('먹은 시간은 현재보다 미래일 수 없어요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(time)
      dialogRef.current?.close()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '먹은 시간을 수정하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  const names: Record<DishPreparation['mealSlot'], string> = {
    breakfast: '첫 번째 끼니', lunch: '두 번째 끼니',
    dinner: '세 번째 끼니', snack: '간식',
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet-dialog"
      aria-labelledby="dish-meal-time-title"
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }}
      onMouseDown={(event) => { if (event.target === dialogRef.current && !saving) onClose() }}
    >
      <form className="sheet" noValidate onSubmit={(event) => void submit(event)}>
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">식기에 담아 등록한 기록</span>
            <h2 id="dish-meal-time-title">끼니 먹은 시간 수정</h2>
          </div>
          <button type="button" aria-label="끼니 시간 수정 닫기" disabled={saving} onClick={onClose}>닫기</button>
        </header>
        <div className="sheet__content">
          <p>{getSeoulDateKey(preparation.consumedAt)} · {names[preparation.mealSlot]}</p>
          <p>같은 끼니의 먹은 기록 전체 시간이 함께 바뀝니다. 음식 구성, 섭취량, 반응 및 냉동 재고는 변경하지 않습니다.</p>
          <label className="field">
            <span>실제로 먹인 시간</span>
            <input
              type="time"
              step={60}
              aria-label="끼니 새 먹은 시간"
              disabled={saving}
              value={time}
              onChange={(event) => { setTime(event.target.value); setError('') }}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer className="sheet__footer">
          <button type="button" disabled={saving} onClick={onClose}>취소</button>
          <button className="primary-button sheet__save" type="submit" disabled={saving || !time}>
            {saving ? '변경 중' : '먹은 시간 변경'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
