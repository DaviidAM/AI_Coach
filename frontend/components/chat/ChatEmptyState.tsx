import type { ReactNode } from 'react'
import styles from './chat.module.css'

interface ChatEmptyStateProps {
  icon?: ReactNode
  title: string
  hint?: ReactNode
  action?: ReactNode
}

export function ChatEmptyState({ icon, title, hint, action }: ChatEmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon && <div className={styles.emptyEmoji}>{icon}</div>}
      <div className={styles.emptyTitle}>{title}</div>
      {hint && <div className={styles.emptyHint}>{hint}</div>}
      {action}
    </div>
  )
}
