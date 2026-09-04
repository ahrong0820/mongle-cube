import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  fromSeoulDateTimeInput,
  getSeoulDateKey,
  toSeoulDateTimeInput,
} from '../lib/date'
import type { ConsumptionRecord } from '../types'
import { Icon } from './Icon'

interface BulkConsumptionTimeSheetProps {
  open: boolean
  records: ConsumptionRecord[]
  dateLabel: string
  onClose: () => void
  onSave: (time: string) => Promise<void>
}

function initialTime(records: ConsumptionRecord[]) {
  const first = records[0]
  return first ? toSeoulDateTimeInput(first.consumedAt).slice(11, 16) : ''
}

export function BulkConsumptionTimeSheet({
  open,
  records,
  dateLabel,
  onClose,
  onSave,
}: BulkConsumptionTimeSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const timeRef = useRef<HTMLInputElement>(null)
  const [time, setTime] = useState(() => initialTime(records))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return

    setTime(initialTime(records))
    setSaving(false)
    setError('')

    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => timeRef.current?.focus(), 0)
    }
  }, [open, records])

  useEffect(() => {
    if (!open && dialogRef.current?.open) dialogRef.current.close()
  }, [open])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || records.length === 0) return

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError('일괄 적용할 시간을 확인해 주세요.')
      return
    }

    const dateKeys = new Set(records.map((record) => getSeoulDateKey(record.consumedAt)))
    if (dateKeys.size !== 1) {
      setError('같은 날짜의 먹은 기록만 한 번에 수정할 수 있어요.')
      return
    }

    const dateKey = getSeoulDateKey(records[0].consumedAt)
    let nextConsumedAt: string
    try {
      nextConsumedAt = fromSeoulDateTimeInput(`${dateKey}T${time}`)
    } catch {
      setError('일괄 적용할 시간을 확인해 주세요.')
      return
    }

    if (new Date(nextConsumedAt).getTime() > Date.now()) {
      setError('먹은 날짜와 시간은 현재보다 미래일 수 없어요.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave(time)
      dialogRef.current?.close()
      onClose()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : '먹은 기록 시간을 일괄 수정하지 못했어요.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (!open || records.length === 0) return null

  return (
    <dialog
      aria-labelledby="bulk-consumption-time-title"
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
      <form className="sheet bulk-consumption-time-sheet" noValidate onSubmit={handleSubmit}>
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">같이 먹은 기록을 한 번에</span>
            <h2 id="bulk-consumption-time-title">시간 일괄 수정</h2>
          </div>
          <button
            aria-label="시간 일괄 수정 닫기"
            className="icon-button"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="sheet__content">
          <div className="bulk-consumption-time-sheet__summary">
            <strong>{dateLabel} · {records.length}개 기록</strong>
            <span>선택한 날짜는 그대로 두고 시간만 모두 같게 바꿔요.</span>
          </div>

          <label className="field">
            <span>
              일괄 적용할 시간 <b>필수</b>
            </span>
            <div className="input-with-icon">
              <Icon name="clock" size={19} />
              <input
                aria-label="일괄 적용할 시간"
                disabled={saving}
                onChange={(event) => {
                  setTime(event.target.value)
                  setError('')
                }}
                ref={timeRef}
                step={60}
                type="time"
                value={time}
              />
            </div>
            <small>음식, 수량, 반응 메모는 바뀌지 않아요.</small>
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="sheet__footer">
          <button disabled={saving} onClick={onClose} type="button">
            취소
          </button>
          <button className="primary-button sheet__save" disabled={saving} type="submit">
            {saving ? <span className="button-spinner" /> : <Icon name="check" size={20} />}
            {saving ? '변경 중' : `${records.length}개 시간 변경`}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
