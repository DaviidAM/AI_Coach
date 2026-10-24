import { AudioPlayer } from './AudioPlayer'
import { RobotIcon, UserIcon } from '@/components/icons/AppIcons'
import type { ChatMessageView } from './types'
import styles from './chat.module.css'

type ChatMessageProps = Omit<ChatMessageView, 'id'>

/**
 * One chat turn: avatar, speaker, timestamp, text bubble and optional audio.
 * Both coaches use this component so improving a message here updates the
 * English and Interview chats together.
 */
export function ChatMessage({
  role,
  text,
  audioSrc,
  audioLabel,
  timestamp,
  pending = false,
  pendingLabel,
  speakerLabel,
}: ChatMessageProps) {
  const isUser = role === 'user'
  const time = formatChatTime(timestamp)

  if (pending && !text) {
    return (
      <div className={`${styles.message} ${styles.messageCoach}`}>
        <div className={styles.avatarCoach} aria-hidden="true">
          <RobotIcon size={34} />
        </div>
        <div className={styles.typingPill} role="status" aria-live="polite">
          <span className={styles.typingDots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className={styles.typingLabel}>
            {pendingLabel ?? `${speakerLabel ?? 'Coach AI'} is typing…`}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`${styles.message} ${
        isUser ? styles.messageUser : styles.messageCoach
      }`}
    >
      {!isUser && (
        <div className={styles.avatarCoach} aria-hidden="true">
          <RobotIcon size={34} />
        </div>
      )}

      <div
        className={`${styles.messageContent} ${
          isUser ? styles.messageContentUser : ''
        }`}
      >
        <div
          className={`${styles.messageHeader} ${
            isUser ? styles.messageHeaderUser : ''
          }`}
        >
          <span className={styles.speaker}>
            {speakerLabel ?? (isUser ? 'You' : 'Coach AI')}
          </span>
          {pending && <span className={styles.pendingDot} aria-hidden="true" />}
          {time && (
            <time className={styles.timestamp} dateTime={String(timestamp)}>
              {time}
            </time>
          )}
        </div>

        <div
          className={`${styles.bubble} ${
            isUser ? styles.bubbleUser : styles.bubbleCoach
          }`}
          data-pending={pending ? 'true' : 'false'}
        >
          {text ? <div className={styles.bubbleText}>{text}</div> : null}

          {!pending && audioSrc && (
            <div
              className={styles.bubbleAudio}
              data-audio-bubble={isUser ? 'user' : 'coach'}
            >
              <AudioPlayer
                src={audioSrc}
                variant={isUser ? 'user' : 'coach'}
                label={audioLabel}
              />
            </div>
          )}
        </div>
      </div>

      {isUser && (
        <div className={styles.avatarUser} aria-hidden="true">
          <UserIcon size={24} />
        </div>
      )}
    </div>
  )
}

function formatChatTime(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
