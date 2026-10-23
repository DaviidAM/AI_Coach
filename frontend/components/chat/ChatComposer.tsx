'use client'

import { Fragment } from 'react'
import type { ChatAction } from './types'
import styles from './chat.module.css'

interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder: string
  limitPlaceholder?: string
  limitMessage?: string
  inputLabel: string
  sendAriaLabel?: string
  recordAriaLabel?: string
  recordingAriaLabel?: string
  busy?: boolean
  atLimit?: boolean
  disabled?: boolean
  recording?: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  actions?: ChatAction[]
}

/**
 * Shared text + hold-to-record composer. Coach pages only provide copy,
 * state and their action row; the input, icons and responsive styles are
 * defined in one place.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  limitPlaceholder,
  limitMessage,
  inputLabel,
  sendAriaLabel = 'Send message',
  recordAriaLabel = 'Hold to record audio',
  recordingAriaLabel = 'Recording — release to send',
  busy = false,
  atLimit = false,
  disabled = false,
  recording = false,
  onStartRecording,
  onStopRecording,
  actions = [],
}: ChatComposerProps) {
  const hasText = value.trim().length > 0
  const micDisabled = busy || atLimit || (disabled && !recording)

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!atLimit && !busy && !disabled && !recording && hasText) onSend()
  }

  return (
    <div className={styles.inputArea}>
      <div className={`${styles.composerRow} ${atLimit ? styles.inputBlocked : ''}`}>
        <button
          type="button"
          className={`${styles.roundButton} ${styles.micBtn}`}
          onMouseDown={onStartRecording}
          onMouseUp={onStopRecording}
          onMouseLeave={onStopRecording}
          onTouchStart={onStartRecording}
          onTouchEnd={onStopRecording}
          onTouchCancel={onStopRecording}
          disabled={micDisabled}
          data-recording={recording ? 'true' : 'false'}
          aria-label={recording ? recordingAriaLabel : recordAriaLabel}
          title={recording ? recordingAriaLabel : recordAriaLabel}
        >
          <svg
            viewBox="0 0 24 24"
            width="19"
            height="19"
            aria-hidden="true"
            fill="currentColor"
          >
            <path d="M12 2a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 12 2Z" />
            <path d="M5.5 11a1 1 0 0 0-2 0 8.5 8.5 0 0 0 7.5 8.45V22h-2a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.55A8.5 8.5 0 0 0 20.5 11a1 1 0 0 0-2 0 6.5 6.5 0 0 1-13 0Z" />
          </svg>
        </button>

        <div className={styles.inputField}>
          <textarea
            className={styles.textInput}
            placeholder={atLimit ? limitPlaceholder ?? placeholder : placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled || atLimit}
            aria-label={inputLabel}
          />
        </div>

        <button
          type="button"
          className={`${styles.roundButton} ${styles.sendBtn}`}
          onClick={onSend}
          disabled={!hasText || busy || atLimit || disabled || recording}
          aria-label={sendAriaLabel}
          title="Send (Enter)"
        >
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
            <path
              d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      {atLimit && limitMessage && (
        <p className={styles.inputBlockedMessage}>{limitMessage}</p>
      )}

      {actions.length > 0 && (
        <div className={styles.resetRow}>
          {actions.map((action, index) => (
            <Fragment key={action.key}>
              {index > 0 && (
                <span className={styles.actionSeparator} aria-hidden="true">
                  ·
                </span>
              )}
              <button
                type="button"
                className={styles.resetBtn}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
