import { useId, useState, type KeyboardEvent } from 'react'

interface IngredientTagInputProps {
  names: string[]
  onChange: (names: string[]) => void
  suggestions?: string[]
  disabled?: boolean
  inputLabel?: string
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function IngredientTagInput({
  names,
  onChange,
  suggestions = [],
  disabled = false,
  inputLabel = '들어간 재료 입력',
}: IngredientTagInputProps) {
  const [input, setInput] = useState('')
  const listId = useId()

  const addInput = () => {
    const name = normalizeName(input.replace(/,$/, ''))
    if (!name) return
    const duplicate = names.some(
      (current) => current.toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR'),
    )
    if (!duplicate && names.length < 12) onChange([...names, name])
    setInput('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addInput()
    }
    if (event.key === 'Backspace' && !input && names.length > 0) {
      onChange(names.slice(0, -1))
    }
  }

  const availableSuggestions = suggestions.filter(
    (suggestion) =>
      !names.some(
        (name) => name.toLocaleLowerCase('ko-KR') === suggestion.toLocaleLowerCase('ko-KR'),
      ),
  )

  return (
    <div className="ingredient-input">
      {names.length > 0 && (
        <div className="ingredient-chips" aria-label="선택한 재료">
          {names.map((name) => (
            <span className="ingredient-chip" key={name.toLocaleLowerCase('ko-KR')}>
              {name}
              <button
                aria-label={`${name} 재료 빼기`}
                disabled={disabled}
                onClick={() => onChange(names.filter((current) => current !== name))}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="ingredient-input__row">
        <input
          aria-label={inputLabel}
          autoComplete="off"
          disabled={disabled || names.length >= 12}
          list={availableSuggestions.length > 0 ? listId : undefined}
          maxLength={40}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={names.length >= 12 ? '재료는 최대 12개까지' : '예: 쌀, 브로콜리'}
          value={input}
        />
        <button
          aria-label="재료 추가"
          disabled={disabled || !normalizeName(input) || names.length >= 12}
          onClick={addInput}
          type="button"
        >
          추가
        </button>
      </div>
      {availableSuggestions.length > 0 && (
        <datalist id={listId}>
          {availableSuggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
    </div>
  )
}
