import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSeoulDateKey } from '../lib/date'
import type { BabyProfile } from '../types'
import { Icon } from './Icon'

interface BabyProfileSheetProps {
  open: boolean
  profile: BabyProfile
  onClose: () => void
  onSave: (profile: BabyProfile) => Promise<void>
}

function isDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-') === value
}

export function BabyProfileSheet({
  open,
  profile,
  onClose,
  onSave,
}: BabyProfileSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const birthDateRef = useRef<HTMLInputElement>(null)
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? '')
  const [weaningStartedOn, setWeaningStartedOn] = useState(profile.weaningStartedOn ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setBirthDate(profile.birthDate ?? '')
    setWeaningStartedOn(profile.weaningStartedOn ?? '')
    setSaving(false)
    setError('')

    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => birthDateRef.current?.focus(), 0)
    }
  }, [open, profile])

  useEffect(() => {
    if (!open && dialogRef.current?.open) dialogRef.current.close()
  }, [open])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (birthDate && !isDateKey(birthDate)) return setError('아기 생일을 확인해 주세요.')
    if (weaningStartedOn && !isDateKey(weaningStartedOn)) {
      return setError('이유식 시작일을 확인해 주세요.')
    }
    if (birthDate && birthDate > getSeoulDateKey(new Date())) {
      return setError('아기 생일은 오늘보다 미래일 수 없어요.')
    }
    if (birthDate && weaningStartedOn && weaningStartedOn < birthDate) {
      return setError('이유식 시작일은 아기 생일보다 빠를 수 없어요.')
    }

    setSaving(true)
    try {
      await onSave({
        birthDate: birthDate || null,
        weaningStartedOn: weaningStartedOn || null,
      })
      dialogRef.current?.close()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '아기 정보를 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <dialog
      aria-labelledby="baby-profile-title"
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
      <form className="sheet baby-profile-sheet" noValidate onSubmit={handleSubmit}>
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">메인과 달력에 한 번만 설정</span>
            <h2 id="baby-profile-title">아기 날짜 정보</h2>
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
          <p className="baby-profile-sheet__intro">
            생일은 메인 화면의 D+로, 이유식 시작일은 메인과 달력의 이유식 일차로 자동 계산해요.
          </p>

          <label className="field">
            <span>아기 생일</span>
            <div className="input-with-icon">
              <Icon name="calendar" size={19} />
              <input
                aria-label="아기 생일"
                max={getSeoulDateKey(new Date())}
                onChange={(event) => setBirthDate(event.target.value)}
                ref={birthDateRef}
                type="date"
                value={birthDate}
              />
            </div>
            <small>메인 화면에서 D+ 일수를 보여줘요.</small>
          </label>

          <label className="field">
            <span>이유식 시작일</span>
            <div className="input-with-icon">
              <Icon name="bowl" size={19} />
              <input
                aria-label="이유식 시작일"
                min={birthDate || undefined}
                onChange={(event) => setWeaningStartedOn(event.target.value)}
                type="date"
                value={weaningStartedOn}
              />
            </div>
            <small>메인과 달력에서 시작한 날을 1일차로 계산해요.</small>
          </label>

          {(birthDate || weaningStartedOn) && (
            <button
              className="baby-profile-sheet__clear"
              disabled={saving}
              onClick={() => {
                setBirthDate('')
                setWeaningStartedOn('')
              }}
              type="button"
            >
              입력한 날짜 모두 지우기
            </button>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="sheet__footer">
          <button className="primary-button sheet__save" disabled={saving} type="submit">
            {saving ? <span className="button-spinner" /> : <Icon name="check" size={20} />}
            {saving ? '저장 중' : '날짜 저장'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}