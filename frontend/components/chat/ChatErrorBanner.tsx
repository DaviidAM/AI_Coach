import styles from './chat.module.css'

interface ChatErrorBannerProps {
  message: string | null
  onDismiss: () => void
}

export function ChatErrorBanner({ message, onDismiss }: ChatErrorBannerProps) {
  if (!message) return null

  return (
    <div className={styles.errorBanner} role="alert">
      <span>⚠️ {message}</span>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
