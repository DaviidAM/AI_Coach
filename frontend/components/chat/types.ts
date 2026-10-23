import type { ReactNode } from 'react'

export type ChatRole = 'user' | 'coach'

/** Normalized message shape consumed by the shared chat components. */
export interface ChatMessageView {
  id?: string | number
  role: ChatRole
  text?: string | null
  audioSrc?: string | null
  audioLabel?: string
  timestamp?: string | number | null
  pending?: boolean
  pendingLabel?: string
  speakerLabel?: ReactNode
}

export interface ChatAction {
  key: string
  label: string
  onClick: () => void
  disabled?: boolean
}
