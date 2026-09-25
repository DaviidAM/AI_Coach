'use client'

import {useTranslations} from 'next-intl'
import {useEffect, useRef, useState} from 'react'
import {Topbar} from '@/components/Topbar'
import {AudioPlayer} from '@/components/AudioPlayer'
import {ErrorsModal} from '@/components/ErrorsModal'
import {LoadingIndicator} from '@/components/LoadingIndicator'
import {CoachIcon} from '@/components/icons/CoachIcon'
import {
  ChatMessage,
  Correction,
  audioUrl,
  resetConversation,
  sendAudio,
  sendText,
} from '@/lib/api'
import styles from '../chat.module.css'

const SESSION_KEY = 'ai-coach-session-id'
const DEVICE_KEY = 'ai-coach-device-id'
const MESSAGES_LIMIT = 5

function getStoredSessionId(): string {
  if (typeof window === 'undefined') return crypto.randomUUID()
  let sid = localStorage.getItem(SESSION_KEY)
  if (!sid) {
    sid = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, sid)
  }
  return sid
}

function getStoredDeviceId(): string {
  if (typeof window === 'undefined') return crypto.randomUUID()
  let did = localStorage.getItem(DEVICE_KEY)
  if (!did) {
    did = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, did)
  }
  return did
}

export default function Home() {
  const t = useTranslations()
  const [sessionId, setSessionId] = useState<string>('')
  const [deviceId, setDeviceId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorsOpen, setErrorsOpen] = useState(false)
  const [allCorrections, setAllCorrections] = useState<Correction[]>([])
  const [recording, setRecording] = useState(false)
  const [config, setConfig] = useState<{
    demo_message_limit: number
    messages_used: number
    unlimited: boolean
  } | null>(null)

  const userMessageCount = messages.filter((m) => m.role === 'user').length
  const atLimit = userMessageCount >= MESSAGES_LIMIT
  const remaining = MESSAGES_LIMIT - userMessageCount

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    setSessionId(getStoredSessionId())
    setDeviceId(getStoredDeviceId())
  }, [])

  // Fetch config when sessionId is available
  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/config?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'})
  }, [messages])

  function appendMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg])
  }

  function updateMessageAt(index: number, updater: Partial<ChatMessage>) {
    setMessages((prev) => {
      const next = [...prev]
      if (index < 0 || index >= next.length) return prev
      next[index] = {...next[index], ...updater}
      return next
    })
  }

  async function handleStreamResponse(res: Response, userIdx: number, coachIdx: number) {
    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const {done, value} = await reader.read()
        if (done) break
        buffer += decoder.decode(value, {stream: true})

        // Process complete SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const event = JSON.parse(data)
            if (event.type === 'chunk') {
              // Streaming chunk — append to coach bubble text
              setMessages((prev) => {
                const next = [...prev]
                const coach = next[coachIdx]
                if (coach) {
                  next[coachIdx] = {
                    ...coach,
                    text: (coach.text || '') + event.text,
                  }
                }
                return next
              })
            } else if (event.type === 'done') {
              // Final response
              updateMessageAt(userIdx, {
                user_audio_url: event.user_audio_url,
              })
              updateMessageAt(coachIdx, {
                text: event.coach_text,
                coach_audio_url: event.coach_audio_url,
                corrections: event.corrections,
                pending: false,
              })
              if (event.corrections?.length) {
                setAllCorrections((prev) => [...prev, ...event.corrections])
              }
              // Refresh config (message count changed)
              if (sessionId) {
                fetch(`/api/config?session_id=${encodeURIComponent(sessionId)}`)
                  .then((r) => r.json())
                  .then(setConfig)
                  .catch(() => {})
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text || busy || !sessionId || atLimit) return
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

    const userIdx = messages.length
    const coachIdx = messages.length + 1

    try {
      // Try streaming endpoint
      const form = new FormData()
      form.append('text', text)
      form.append('session_id', sessionId)

      const headers: HeadersInit = {}
      if (deviceId) headers['X-User-Device-Id'] = deviceId

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        body: form,
        headers,
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      await handleStreamResponse(res, userIdx, coachIdx)
    } catch (err: any) {
      console.error('sendText error', err)
      setError(err?.message || t('chatError', {error: ''}))
      setMessages((prev) => prev.filter((m) => !m.pending))
    } finally {
      setBusy(false)
    }
  }

  async function startRecording() {
    if (busy || !sessionId || atLimit) return
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('microphoneNotAvailable'))
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setError(t('microphoneNotSupported'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true})
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const producedType = chunksRef.current[0]?.type || 'audio/webm'
        const blob = new Blob(chunksRef.current, {type: producedType})
        await submitAudio(blob)
      }
      mr.start()
      setRecording(true)
    } catch (err: any) {
      console.error('mic error', err)
      const msg =
        err?.name === 'NotAllowedError'
          ? t('microphonePermissionDenied')
          : t('microphoneUnavailable')
      setError(msg)
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.stop()
    }
    setRecording(false)
  }

  async function submitAudio(blob: Blob) {
    setBusy(true)
    const placeholderUser: ChatMessage = {
      role: 'user',
      text: t('audioTranscribing'),
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
      setError(err?.message || t('chatError', {error: ''}))
      setMessages((prev) => prev.filter((m) => !m.pending))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    if (!sessionId) return
    if (!confirm(t('resetConfirm'))) return
    setBusy(true)
    try {
      await resetConversation(sessionId)
      setMessages([])
      setAllCorrections([])
      setError(null)
      if (sessionId) {
        fetch(`/api/config?session_id=${encodeURIComponent(sessionId)}`)
          .then((r) => r.json())
          .then(setConfig)
          .catch(() => {})
      }
    } catch (err: any) {
      setError(err?.message || t('failedToReset'))
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (atLimit) return
      send()
    }
  }

  const latestCorrections =
    messages.length > 0 ? messages[messages.length - 1].corrections ?? [] : []

  function timeOf(ts: number): string {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Derive chip display
  const showChip = config && !config.unlimited
  const chipRemaining = config
    ? Math.max(0, config.demo_message_limit - config.messages_used)
    : remaining
  const chipAmber = chipRemaining <= 1 && chipRemaining > 0
  const chipRed = chipRemaining === 0

  return (
    <div className={styles.chatPage}>
      <div className={styles.topbarZone}>
        <Topbar
          errorCount={allCorrections.length}
          onOpenErrors={() => setErrorsOpen(true)}
          messageCount={userMessageCount}
          messageLimit={MESSAGES_LIMIT}
          showChip={showChip ?? false}
          chipRemaining={chipRemaining}
          chipAmber={chipAmber}
          chipRed={chipRed}
        />
      </div>

      <ErrorsModal
        open={errorsOpen}
        sessionId={sessionId}
        onClose={() => setErrorsOpen(false)}
      />

      <main className={styles.chatMain}>
        <div className={styles.messagesArea}>
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyEmoji}><CoachIcon size={64} /></div>
              <div className={styles.emptyTitle}>{t('startConversation')}</div>
              <div className={styles.emptyHint}>{t('emptyHint')}</div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={`${styles.message} ${
                  m.role === 'user' ? styles.messageUser : styles.messageCoach
                }`}
              >
                <div
                  className={`${styles.bubble} ${
                    m.role === 'user' ? styles.bubbleUser : styles.bubbleCoach
                  }`}
                  data-pending={m.pending ? 'true' : 'false'}
                >
                  {m.pending && !m.text ? (
                    <LoadingIndicator />
                  ) : m.text ? (
                    <div className={styles.bubbleText}>{m.text}</div>
                  ) : null}

                  {!m.pending && m.user_audio_url && (
                    <div
                      className={`${styles.bubbleAudio} ${styles.bubbleUser}`}
                      data-audio-bubble="user"
                    >
                      <AudioPlayer
                        src={audioUrl(m.user_audio_url) || m.user_audio_url}
                        variant="user"
                      />
                    </div>
                  )}
                  {!m.pending && m.coach_audio_url && (
                    <div
                      className={`${styles.bubbleAudio} ${styles.bubbleCoach}`}
                      data-audio-bubble="coach"
                    >
                      <AudioPlayer
                        src={audioUrl(m.coach_audio_url) || m.coach_audio_url}
                        variant="coach"
                      />
                    </div>
                  )}

                  <div className={styles.bubbleMeta}>
                    {m.pending && <span className={styles.pendingDot} aria-hidden="true" />}
                    <span className={styles.timestamp}>{timeOf(m.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)}>{t('dismiss')}</button>
          </div>
        )}

        {messages.length > 0 && (
          <div className={styles.correctionsPanel}>
            <div className={styles.correctionsHeader}>
              <div className={styles.correctionsTitle}>{t('correctionsForLast')}</div>
              <div className={styles.correctionsLevel}>{t('shown', {count: latestCorrections.length})}</div>
            </div>
            {latestCorrections.length === 0 ? (
              <div className={styles.correctionsEmpty}>{t('noCorrections')}</div>
            ) : (
              latestCorrections.map((c, idx) => (
                <div key={idx} className={styles.correctionCard}>
                  <div className={styles.correctionRow}>
                    <span className={styles.correctionOriginal}>{c.original_phrase}</span>
                    <span className={styles.correctionArrow}>→</span>
                    <span className={styles.correctionFixed}>{c.corrected_phrase}</span>
                    <span className={styles.correctionLevel}>{c.error_level}</span>
                  </div>
                  <div className={styles.correctionExplanation}>{c.explanation}</div>
                </div>
              ))
            )}
          </div>
        )}

        <div className={styles.inputArea}>
          <div className={`${styles.inputWrapper} ${atLimit ? styles.inputBlocked : ''}`}>
            <textarea
              className={styles.textInput}
              placeholder={
                atLimit
                  ? t('demoLimitMessage')
                  : t('typeMessage')
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={atLimit}
              aria-label={t('sendMessage')}
            />
            {input.trim().length > 0 ? (
              <button
                className={`${styles.iconBtn} ${styles.sendBtn}`}
                onClick={() => send()}
                disabled={busy || atLimit}
                aria-label={t('sendMessage')}
                title={t('sendEnter')}
              >
                <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
                  <path d="M2 8l12-6-3 14-3-6-6-2z" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <button
                className={`${styles.iconBtn} ${styles.micBtn}`}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={() => recording && stopRecording()}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={busy || atLimit}
                data-recording={recording ? 'true' : 'false'}
                aria-label={recording ? t('recordingRelease') : t('holdToRecord')}
                title={t('holdToRecord')}
              >
                <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
                  <path d="M8 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3zM3 8a5 5 0 0010 0h-1a4 4 0 11-8 0H3zM8 13a1 1 0 011 1v1H7v-1a1 1 0 011-1z" />
                </svg>
              </button>
            )}
          </div>
          {atLimit && (
            <p className={styles.inputBlockedMessage}>{t('demoLimitReachedInput')}</p>
          )}
          {messages.length > 0 && (
            <div className={styles.resetRow}>
              <button
                className={styles.resetBtn}
                onClick={handleReset}
                disabled={busy}
              >
                {t('resetConversation')}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
