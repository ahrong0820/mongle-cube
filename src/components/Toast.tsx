import { Icon } from './Icon'

interface ToastProps {
  message: string
  tone?: 'success' | 'error'
}

export function Toast({ message, tone = 'success' }: ToastProps) {
  return (
    <div className={`toast toast--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'success' && <Icon name="check" size={18} />}
      <span>{message}</span>
    </div>
  )
}
