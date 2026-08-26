import { useEffect, useRef, useState } from 'react'
import type { CubeRecipe } from '../types'
import { Icon } from './Icon'
import { IngredientTagInput } from './IngredientTagInput'

interface IngredientSetupSheetProps {
  open: boolean
  recipes: CubeRecipe[]
  suggestions: string[]
  onClose: () => void
  onSave: (recipe: CubeRecipe, ingredientNames: string[]) => Promise<void>
}

export function IngredientSetupSheet({
  open,
  recipes,
  suggestions,
  onClose,
  onSave,
}: IngredientSetupSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [ingredientNames, setIngredientNames] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const recipe = recipes[0] ?? null

  useEffect(() => {
    if (!open) return
    setIngredientNames([])
    setSaving(false)
    setError('')
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [open])

  useEffect(() => {
    setIngredientNames([])
    setError('')
  }, [recipe?.id])

  useEffect(() => {
    if (!open && dialogRef.current?.open) dialogRef.current.close()
  }, [open])

  if (!open || !recipe) return null

  const handleSave = async () => {
    if (ingredientNames.length === 0) {
      setError('이 큐브에 실제로 들어간 재료를 한 개 이상 입력해 주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(recipe, ingredientNames)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '재료를 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      aria-labelledby="ingredient-setup-title"
      className="sheet-dialog"
      onCancel={(event) => {
        event.preventDefault()
        if (!saving) onClose()
      }}
      ref={dialogRef}
    >
      <div className="sheet ingredient-setup-sheet">
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <span className="eyebrow">기존 기록 정리 · {recipes.length}개 남음</span>
            <h2 id="ingredient-setup-title">들어간 재료 확인</h2>
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

        <div className="sheet__content ingredient-setup-sheet__content">
          <div className="ingredient-setup-recipe">
            <span>큐브 이름</span>
            <strong>{recipe.name}</strong>
            <small>이름만 보고 재료를 자동 추측하지 않아요.</small>
          </div>

          <div className="field">
            <span>
              들어간 재료 <b>필수</b>
            </span>
            <IngredientTagInput
              disabled={saving}
              inputLabel={`${recipe.name} 들어간 재료 입력`}
              names={ingredientNames}
              onChange={setIngredientNames}
              suggestions={suggestions}
            />
            <small>과거 NEW 표시는 여기서 확인한 실제 재료를 기준으로 다시 계산해요.</small>
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="sheet__footer">
          <button
            className="primary-button sheet__save"
            disabled={saving}
            onClick={handleSave}
            type="button"
          >
            {saving ? <span className="button-spinner" /> : <Icon name="check" size={20} />}
            {saving ? '저장 중' : '이 재료로 확인'}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
