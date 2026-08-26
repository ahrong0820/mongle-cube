import { useEffect, useRef, useState } from 'react'
import type { CubeBatch } from '../types'
import { Icon } from './Icon'

interface CubeDisposalSheetProps {
  batch: CubeBatch | null
  open: boolean
  pendingPlanCount: number
  onClose: () => void
  onConfirm: (batch: CubeBatch) => Promise<void>
}

export function CubeDisposalSheet({
  batch,
  open,
  pendingPlanCount,
  onClose,
  onConfirm,
}: CubeDisposalSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      if (dialogRef.current?.open) dialogRef.current.close()
      return
    }

    setSaving(false)
    setError('')
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [open, batch?.id])

  if (!open || !batch) return null

  const handleConfirm = async () => {
    setSaving(true)
    setError('')
    try {
      await onConfirm(batch)
      dialogRef.current?.close()
      onClose()
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : '폐기하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      aria-labelledby="cube-disposal-title"
      className="sheet-dialog disposal-dialog"
      onCancel={(event) => {
        event.preventDefault()
        if (!saving) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current && !saving) onClose()
      }}
      ref={dialogRef}
    >
      <section className="sheet disposal-sheet">
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">먹지 않고 정리하기</span>
            <h2 id="cube-disposal-title">남은 큐브 폐기</h2>
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

        <div className="sheet__content disposal-sheet__content">
          <div className="disposal-sheet__summary">
            <span aria-hidden="true"><Icon name="trash" size={23} /></span>
            <div>
              <strong>{batch.name} {batch.quantity}개가 남아 있어요.</strong>
              <p>남은 {batch.quantity}개를 먹은 기록으로 남기지 않고 폐기 처리할까요?</p>
            </div>
          </div>

          <ul className="disposal-sheet__notes">
            <li>과거에 먹은 기록과 아기 반응은 그대로 보존돼요.</li>
            <li>이 제작 배치는 재고 없음으로 이동하고 {batch.quantity}개 폐기로 표시돼요.</li>
            <li>실수했다면 폐기 기록 취소로 {batch.quantity}개를 다시 복원할 수 있어요.</li>
          </ul>

          {pendingPlanCount > 0 && (
            <div className="disposal-sheet__plan-warning" role="note">
              <Icon name="calendar" size={19} />
              <p>
                <strong>예정된 식단 {pendingPlanCount}건이 있어요.</strong>
                <span>
                  식단 기록은 임의로 삭제하지 않아요. 폐기 후에는 이 배치 재고가 0개라서
                  먹었어요 처리를 할 수 없으니 필요하면 식단에서 빼거나 새 배치로 다시 계획해 주세요.
                </span>
              </p>
            </div>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <footer className="sheet__footer disposal-sheet__footer">
          <button disabled={saving} onClick={onClose} type="button">취소</button>
          <button className="danger-button" disabled={saving} onClick={handleConfirm} type="button">
            {saving ? <span className="button-spinner" /> : <Icon name="trash" size={18} />}
            {saving ? '폐기 중' : `${batch.quantity}개 폐기`}
          </button>
        </footer>
      </section>
    </dialog>
  )
}
