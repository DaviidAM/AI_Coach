'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { LoadingIndicator } from './LoadingIndicator'
import { ChatMessage } from './ChatMessage'
import type { ChatMessageView } from './types'
import styles from './chat.module.css'

interface ChatMessageListProps {
  messages: ChatMessageView[]
  loading?: boolean
  loadingLabel?: string
  loadingHint?: string
  emptyState?: ReactNode
}

/** Scrollable conversation area shared by every coach. */
export function ChatMessageList({
  messages,
  loading = false,
  loadingLabel = 'Loading…',
  loadingHint,
  emptyState,
}: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessage = messages[messages.length - 1]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [
    messages.length,
    lastMessage?.text,
    lastMessage?.audioSrc,
    lastMessage?.pending,
  ])

  return (
    <div className={styles.messagesArea}>
      {loading ? (
        <div className={styles.empty}>
          <LoadingIndicator label={loadingLabel} />
          {loadingHint && <div className={styles.emptyHint}>{loadingHint}</div>}
        </div>
      ) : messages.length === 0 ? (
        emptyState
      ) : (
        messages.map((message, index) => (
          <ChatMessage key={message.id ?? index} {...message} />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}
