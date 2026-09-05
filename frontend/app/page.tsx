'use client'

import { useEffect, useRef, useState } from 'react'
import { Topbar } from '@/components/Topbar'
import { AudioPlayer } from '@/components/AudioPlayer'
import {
  ChatMessage,
  audioUrl,
  resetConversation,
  sendAudio,
  sendText,
} from '@/lib/api'
import styles from './chat.module.css'

const SESSION_KEY = 'ai-coach-session-id'

function getStoredSessionId(): string {
  if (typeof window === 'undefined') return crypto.randomUUID()
  let sid = localStorage.getItem(SESSION_KEY)
  if (!sid) {
    sid = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, sid)
  }
  return sid
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    setSessionId(getStoredSessionId())
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

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
    if (!text || busy || !sessionId) return
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
    } catch (err: any) {
      console.error('sendText error', err)
      setError(err?.message || 'Failed to send message')
      setMessages((prev) => prev.filter((m) => !m.pending))
    } finally {
      setBusy(false)
    }
  }

  async function startRecording() {
    if (busy || !sessionId) return
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone API not available in this browser.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const producedType = chunksRef.current[0]?.type || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: producedType })
        await submitAudio(blob)
      }
      mr.start()
      setRecording(true)
    } catch (err: any) {
      console.error('mic error', err)
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow access in the browser.'
          : 'Microphone unavailable. Check browser permissions.'
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
    } catch (err: any) {
      console.error('audio submit error', err)
      setError(err?.message || 'Failed to send audio')
      setMessages((prev) => prev.filter((m) => !m.pending))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    if (busy || !sessionId) return
    if (!confirm('Reset conversation and clear history?')) return
    try {
      await resetConversation(sessionId)
      setMessages([])
      setError(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to reset')
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
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

  return (
    <div className={styles.chatPage}>
      <div className={styles.topbarZone}>
        <Topbar />
      </div>

      <main className={styles.chatMain}>
        <div className={styles.messagesArea}>
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyEmoji}>🎯</div>
              <div className={styles.emptyTitle}>Start a conversation</div>
              <div className={styles.emptyHint}>
                Type a message or hold the mic to record audio. The COACH replies in text
                and audio, with corrections filtered to your selected CEFR level.
              </div>
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
                  {m.text && (
                    <div className={styles.bubbleText}>{m.text}</div>
                  )}

                  {!m.pending && m.user_audio_url && (
                    <div className={styles.bubbleAudio}>
                      <AudioPlayer
                        src={audioUrl(m.user_audio_url) || m.user_audio_url}
                        variant="user"
                      />
                    </div>
                  )}
                  {!m.pending && m.coach_audio_url && (
                    <div className={styles.bubbleAudio}>
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
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {messages.length > 0 && (
          <div className={styles.correctionsPanel}>
            <div className={styles.correctionsHeader}>
              <div className={styles.correctionsTitle}>✏️ Corrections for last message</div>
              <div className={styles.correctionsLevel}>{latestCorrections.length} shown</div>
            </div>
            {latestCorrections.length === 0 ? (
              <div className={styles.correctionsEmpty}>
                No corrections at or below your selected level.
              </div>
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
          <div className={styles.inputWrapper}>
            <textarea
              className={styles.textInput}
              placeholder={
                recording
                  ? '🔴 Recording... release to send'
                  : 'Type a message — Enter to send, Shift+Enter for newline'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={busy}
              aria-label="Message input"
            />
            {input.trim().length > 0 ? (
              <button
                className={`${styles.iconBtn} ${styles.sendBtn}`}
                onClick={() => send()}
                disabled={busy}
                aria-label="Send message"
                title="Send (Enter)"
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
                disabled={busy}
                data-recording={recording ? 'true' : 'false'}
                aria-label={recording ? 'Recording — release to send' : 'Hold to record audio'}
                title="Hold to record audio"
              >
                <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
                  <path d="M8 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3zM3 8a5 5 0 0010 0h-1a4 4 0 11-8 0H3zM8 13a1 1 0 011 1v1H7v-1a1 1 0 011-1z" />
                </svg>
              </button>
            )}
          </div>
          {messages.length > 0 && (
            <div className={styles.resetRow}>
              <button
                className={styles.resetBtn}
                onClick={handleReset}
                disabled={busy}
              >
                Reset conversation
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
