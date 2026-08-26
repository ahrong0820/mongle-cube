import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSeoulDateKey } from '../lib/date'
import type { BabyProfile } from '../types'
import { Icon } from './Icon'

interface BabyProfileSheetProps {
  open: boolean
  profile: BabyProfile
  identityRequired?: boolean
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
  identityRequired = false,
  onClose,
  onSave,
}: BabyProfileSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const babyNameRef = useRef<HTMLInputElement>(null)
  const [babyName, setBabyName] = useState(profile.babyName ?? '')
  const [displayName, setDisplayName] = useState(profile.displayName ?? '')
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? '')
  const [weaningStartedOn, setWeaningStartedOn] = useState(profile.weaningStartedOn ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setBabyName(profile.babyName ?? '')
    setDisplayName(profile.displayName ?? '')
    setBirthDate(profile.birthDate ?? '')
    setWeaningStartedOn(profile.weaningStartedOn ?? '')
    setSaving(false)
    setError('')

    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => babyNameRef.current?.focus(), 0)
    }
  }, [open, profile])

  useEffect(() => {
    if (!open && dialogRef.current?.open) dialogRef.current.close()
  }, [open])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    const nextBabyName = babyName.trim()
    const nextDisplayName = displayName.trim()

    if (identityRequired && !nextBabyName) return setError('아이 이름을 입력해 주세요.')
    if (nextBabyName.length > 20) return setError('아이 이름은 20자 이내로 입력해 주세요.')
    if (identityRequired && !nextDisplayName) return setError('가구 이름을 입력해 주세요.')
    if (nextDisplayName.length > 40) return setError('가구 이름은 40자 이내로 입력해 주세요.')
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
        babyName: nextBabyName || null,
        displayName: nextDisplayName || null,
        birthDate: birthDate || null,
        weaningStartedOn: weaningStartedOn || null,
      })
      dialogRef.current?.close()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '아기·가족 정보를 저장하지 못했어요.')
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
            <span className="eyebrow">가족 냉동실 프로필</span>
            <h2 id="baby-profile-title">아기·가족 정보</h2>
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
            이름은 현재 가족 냉동실을 구분하는 데 쓰고, 날짜는 D+와 이유식 일차를 계산해요.
          </p>

          <label className="field">
            <span>아이 이름{identityRequired && ' · 필수'}</span>
            <input
              aria-label="아이 이름"
              autoComplete="off"
              maxLength={20}
              onChange={(event) => setBabyName(event.target.value)}
              placeholder="예: 하준"
              ref={babyNameRef}
              type="text"
              value={babyName}
            />
            <small>아이 이름 자체로 저장해요. 가구 이름과는 별개예요.</small>
          </label>

          <label className="field">
            <span>가구 이름{identityRequired && ' · 필수'}</span>
            <input
              aria-label="가구 이름"
              autoComplete="off"
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="예: 하준이네"
              type="text"
              value={displayName}
            />
            <small>메인 화면과 운영 구분에 표시되는 이름이에요.</small>
          </label>

          <label className="field">
            <span>아기 생일</span>
            <div className="input-with-icon">
              <Icon name="calendar" size={19} />
              <input
                aria-label="아기 생일"
                max={getSeoulDateKey(new Date())}
                onChange={(event) => setBirthDate(event.target.value)}
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
            {saving ? '저장 중' : '정보 저장'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
