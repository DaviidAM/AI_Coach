import type { ReactNode } from 'react'
import styles from './chat.module.css'

interface ChatShellProps {
  topbar: ReactNode
  children: ReactNode
}

/**
 * Shared page frame for every coach: atmospheric forest background, a
 * centered rounded window, the coach header and the scrolling conversation.
 */
export function ChatShell({ topbar, children }: ChatShellProps) {
  return (
    <main className={styles.chatPage}>
      <div className={`${styles.ambient} ${styles.ambientAmber}`} aria-hidden="true" />
      <div className={`${styles.ambient} ${styles.ambientEmerald}`} aria-hidden="true" />
      <div className={`${styles.ambient} ${styles.ambientMint}`} aria-hidden="true" />

      <div className={styles.chatCard} data-purpose="chat-main-window">
        {topbar}
        <div className={styles.chatMain}>{children}</div>
      </div>
    </main>
  )
}
