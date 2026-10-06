import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  formatHistoryTime,
  fromSeoulDateTimeInput,
  getSeoulDateKey,
} from '../lib/date'
import type { ConsumptionRecord } from '../types'
import { Icon } from './Icon'

interface BulkConsumptionTimeSheetProps {
  open: boolean
  records: ConsumptionRecord[]
  dateLabel: string
  onClose: () => void
  onSave: (recordIds: string[], time: string) => Promise<void>
}

interface TimeGroup {
  time: string
  records: ConsumptionRecord[]
}

function groupByCurrentTime(records: ConsumptionRecord[]): TimeGroup[] {
  const groups = new Map<string, ConsumptionRecord[]>()

  for (const record of records) {
    const time = formatHistoryTime(record.consumedAt)
    groups.set(time, [...(groups.get(time) ?? []), record])
  }

  return [...groups.entries()].map(([time, groupedRecords]) => ({
    time,
    records: groupedRecords,
  }))
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const timeGroups = useMemo(() => groupByCurrentTime(records), [records])
  const selectedRecords = useMemo(
    () => records.filter((record) => selectedIds.has(record.id)),
    [records, selectedIds],
  )

  useEffect(() => {
    if (!open) return

    setSelectedIds(new Set())
    setTime('')
    setSaving(false)
    setError('')

    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
    }
  }, [open, records])

  useEffect(() => {
    if (!open && dialogRef.current?.open) dialogRef.current.close()
  }, [open])

  const toggleRecord = (recordId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(recordId)) next.delete(recordId)
      else next.add(recordId)
      return next
    })
    setError('')
  }

  const toggleTimeGroup = (group: TimeGroup) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allSelected = group.records.every((record) => next.has(record.id))

      for (const record of group.records) {
        if (allSelected) next.delete(record.id)
        else next.add(record.id)
      }
      return next
    })
    setError('')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || records.length === 0) return

    if (selectedRecords.length < 2) {
      setError('같이 바꿀 먹은 기록을 2개 이상 선택해 주세요.')
      return
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError('일괄 적용할 시간을 확인해 주세요.')
      return
    }

    const dateKeys = new Set(
      selectedRecords.map((record) => getSeoulDateKey(record.consumedAt)),
    )
    if (dateKeys.size !== 1) {
      setError('같은 날짜의 먹은 기록만 한 번에 수정할 수 있어요.')
      return
    }

    const dateKey = getSeoulDateKey(selectedRecords[0].consumedAt)
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
      await onSave(selectedRecords.map((record) => record.id), time)
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
            <span className="eyebrow">한 끼 기록만 골라서</span>
            <h2 id="bulk-consumption-time-title">선택한 기록 시간 수정</h2>
          </div>
          <button
            aria-label="선택한 기록 시간 수정 닫기"
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
            <strong>
              {dateLabel} · 전체 {records.length}개
            </strong>
            <span>오전·오후 기록 중 같이 바꿀 것만 골라 주세요.</span>
          </div>

          <section
            aria-label="시간을 같이 바꿀 먹은 기록 선택"
            className="bulk-consumption-time-sheet__records"
          >
            {timeGroups.map((group) => {
              const selectedCount = group.records.filter((record) =>
                selectedIds.has(record.id),
              ).length
              const allSelected =
                group.records.length > 0 && selectedCount === group.records.length

              return (
                <div className="bulk-time-group" key={group.time}>
                  <div className="bulk-time-group__header">
                    <div>
                      <strong>{group.time}</strong>
                      <span>{group.records.length}개</span>
                    </div>
                    <button
                      aria-pressed={allSelected}
                      disabled={saving}
                      onClick={() => toggleTimeGroup(group)}
                      type="button"
                    >
                      {allSelected ? '이 시간 해제' : '이 시간 선택'}
                    </button>
                  </div>

                  <div className="bulk-time-group__records">
                    {group.records.map((record) => {
                      const checked = selectedIds.has(record.id)
                      const unitText =
                        record.unitAmount && record.unit
                          ? ` · ${record.unitAmount}${record.unit}`
                          : ''

                      return (
                        <label
                          className={`bulk-time-record ${checked ? 'is-selected' : ''}`}
                          key={record.id}
                        >
                          <input
                            aria-label={`${record.cubeName} ${group.time} 기록 선택`}
                            checked={checked}
                            disabled={saving}
                            onChange={() => toggleRecord(record.id)}
                            type="checkbox"
                          />
                          <span className="bulk-time-record__check" aria-hidden="true">
                            {checked && <Icon name="check" size={14} />}
                          </span>
                          <span className="bulk-time-record__copy">
                            <strong>{record.cubeName}</strong>
                            <small>
                              {group.time}
                              {unitText}
                            </small>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>

          <label className="field">
            <span>
              새로 적용할 시간 <b>필수</b>
            </span>
            <div className="input-with-icon">
              <Icon name="clock" size={19} />
              <input
                aria-label="선택한 기록에 적용할 시간"
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
            <small>
              {selectedRecords.length > 0
                ? `${selectedRecords.length}개 선택됨 · 날짜와 반응은 그대로예요.`
                : '2개 이상 선택하면 한 번에 시간을 바꿀 수 있어요.'}
            </small>
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
          <button
            className="primary-button sheet__save"
            disabled={saving || selectedRecords.length < 2 || !time}
            type="submit"
          >
            {saving ? <span className="button-spinner" /> : <Icon name="check" size={20} />}
            {saving
              ? '변경 중'
              : selectedRecords.length >= 2
                ? `선택한 ${selectedRecords.length}개 변경`
                : '기록을 선택해 주세요'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
