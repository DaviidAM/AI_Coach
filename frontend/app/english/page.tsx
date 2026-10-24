'use client'

import { useEffect, useState } from 'react'
import { Topbar } from '@/components/Topbar'
import { ErrorsModal } from '@/components/ErrorsModal'
import { RobotIcon } from '@/components/icons/AppIcons'
import {
  ChatComposer,
  ChatEmptyState,
  ChatErrorBanner,
  ChatMessageList,
  ChatShell,
  type ChatMessageView,
} from '@/components/chat'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useStoredSessionId } from '@/hooks/useStoredSessionId'
import {
  ChatMessage,
  Correction,
  audioUrl,
  resetConversation,
  sendAudio,
  sendText,
} from '@/lib/api'
import correctionsStyles from './corrections.module.css'

const SESSION_KEY = 'ai-coach-session-id'

export default function Home() {
  const sessionId = useStoredSessionId(SESSION_KEY)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorsOpen, setErrorsOpen] = useState(false)
  const [allCorrections, setAllCorrections] = useState<Correction[]>([])

  const userMessageCount = messages.filter((m) => m.role === 'user').length
  const [messageLimit, setMessageLimit] = useState<number | null>(5)

  const atLimit = messageLimit !== null && userMessageCount >= messageLimit

  const { recording, startRecording, stopRecording } = useAudioRecorder({
    enabled: Boolean(sessionId) && !busy && !atLimit,
    onAudio: submitAudio,
    onError: setError,
  })

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg: { demo_message_limit: number | null; unlimited: boolean }) => {
        setMessageLimit(cfg.unlimited ? null : (cfg.demo_message_limit ?? 5))
      })
      .catch(() => {
        console.warn('Failed to fetch /api/config, using default limit of 5')
        setMessageLimit(5)
      })
  }, [])

  function appendMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg])
  }

  function updateMessageAt(index: number, updater: Partial<ChatMessage>) {
    setMessages((prev) => {
      const next = [...prev]
      if (index < 0 || index >= next.length) return prev
      next[index] = { ...next[index], ...updater }
      return next
    })
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text || busy || recording || !sessionId || atLimit) return
    setError(null)
    setInput('')

    const userMsg: ChatMessage = {
      role: 'user',
      text,
      timestamp: Date.now(),
    }
    const placeholderCoach: ChatMessage = {
      role: 'coach',
      text: '',
      timestamp: Date.now(),
      pending: true,
    }
    appendMessage(userMsg)
    appendMessage(placeholderCoach)
    setBusy(true)

    try {
      const res = await sendText(text, sessionId)
      updateMessageAt(messages.length, { user_audio_url: res.user_audio_url })
      updateMessageAt(messages.length + 1, {
        text: res.coach_text,
        coach_audio_url: res.coach_audio_url,
        corrections: res.corrections,
        pending: false,
      })
      if (res.corrections?.length) {
        setAllCorrections((prev) => [...prev, ...res.corrections])
      }
    } catch (err: any) {
      console.error('sendText error', err)
      setError(err?.message || 'Failed to send message')
      setMessages((prev) => prev.filter((m) => !m.pending))
    } finally {
      setBusy(false)
    }
  }

  async function submitAudio(blob: Blob) {
    if (!sessionId || atLimit || busy) return
    setBusy(true)
    const placeholderUser: ChatMessage = {
      role: 'user',
      text: '🎤 (transcribing...)',
      timestamp: Date.now(),
      pending: true,
    }
    const placeholderCoach: ChatMessage = {
      role: 'coach',
      text: '',
      timestamp: Date.now(),
      pending: true,
    }
    appendMessage(placeholderUser)
    appendMessage(placeholderCoach)

    const userIdx = messages.length
    const coachIdx = messages.length + 1

    try {
      const res = await sendAudio(blob, sessionId)
      updateMessageAt(userIdx, {
        text: res.user_text,
        user_audio_url: res.user_audio_url,
        pending: false,
      })
      updateMessageAt(coachIdx, {
        text: res.coach_text,
        coach_audio_url: res.coach_audio_url,
        corrections: res.corrections,
        pending: false,
      })
      if (res.corrections?.length) {
        setAllCorrections((prev) => [...prev, ...res.corrections])
      }
    } catch (err: any) {
      console.error('audio submit error', err)
      setError(err?.message || 'Failed to send audio')
      setMessages((prev) => prev.filter((m) => !m.pending))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    if (!sessionId) return
    if (!confirm('Reset conversation and clear history?')) return
    setBusy(true)
    try {
      await resetConversation(sessionId)
      setMessages([])
      setAllCorrections([])
      setError(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to reset')
    } finally {
      setBusy(false)
    }
  }

  function handleStartRecording() {
    setError(null)
    startRecording()
  }

  const latestCorrections =
    messages.length > 0 ? messages[messages.length - 1].corrections ?? [] : []

  const messageViews: ChatMessageView[] = messages.map((message, index) => {
    const isUser = message.role === 'user'
    const rawAudio = isUser ? message.user_audio_url : message.coach_audio_url
    return {
      id: index,
      role: message.role,
      text: message.text,
      audioSrc: audioUrl(rawAudio) || rawAudio,
      audioLabel: isUser ? 'You' : 'Coach',
      timestamp: message.timestamp,
      pending: message.pending,
      pendingLabel: 'Coach AI is typing…',
    }
  })

  return (
    <>
      <ChatShell
        topbar={
          <Topbar
            errorCount={allCorrections.length}
            onOpenErrors={() => setErrorsOpen(true)}
            messageCount={userMessageCount}
            messageLimit={messageLimit}
          />
        }
      >
        <ChatMessageList
          messages={messageViews}
          emptyState={
            <ChatEmptyState
              icon={<RobotIcon size={64} />}
              title="Start a conversation"
              hint="Type a message or hold the mic to record audio. The COACH replies in text and audio, with corrections filtered to your selected CEFR level."
            />
          }
        />

        <ChatErrorBanner message={error} onDismiss={() => setError(null)} />

        {messages.length > 0 && (
          <div className={correctionsStyles.correctionsPanel}>
            <div className={correctionsStyles.correctionsHeader}>
              <div className={correctionsStyles.correctionsTitle}>
                ✏️ Corrections for last message
              </div>
              <div className={correctionsStyles.correctionsLevel}>
                {latestCorrections.length} shown
              </div>
            </div>
            {latestCorrections.length === 0 ? (
              <div className={correctionsStyles.correctionsEmpty}>
                No corrections at or below your selected level.
              </div>
            ) : (
              latestCorrections.map((correction, index) => (
                <div key={index} className={correctionsStyles.correctionCard}>
                  <div className={correctionsStyles.correctionRow}>
                    <span className={correctionsStyles.correctionOriginal}>
                      {correction.original_phrase}
                    </span>
                    <span className={correctionsStyles.correctionArrow}>→</span>
                    <span className={correctionsStyles.correctionFixed}>
                      {correction.corrected_phrase}
                    </span>
                    <span className={correctionsStyles.correctionLevel}>
                      {correction.error_level}
                    </span>
                  </div>
                  <div className={correctionsStyles.correctionExplanation}>
                    {correction.explanation}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <ChatComposer
          value={input}
          onChange={setInput}
          onSend={() => send()}
          placeholder="Type a message — Enter to send, Shift+Enter for newline"
          limitPlaceholder="Demo version message limit reached. Use the Reset button to continue."
          limitMessage="Demo version limit reached. Click Reset conversation to start over."
          inputLabel="Message input"
          sendAriaLabel="Send message"
          recordAriaLabel="Hold to record audio"
          recordingAriaLabel="Recording — release to send"
          busy={busy}
          atLimit={atLimit}
          disabled={atLimit}
          recording={recording}
          onStartRecording={handleStartRecording}
          onStopRecording={stopRecording}
          actions={
            messages.length > 0
              ? [
                  {
                    key: 'reset',
                    label: 'Reset conversation',
                    onClick: handleReset,
                    disabled: busy,
                  },
                ]
              : []
          }
        />
      </ChatShell>

      <ErrorsModal
        open={errorsOpen}
        sessionId={sessionId}
        onClose={() => setErrorsOpen(false)}
      />
    </>
  )
}
