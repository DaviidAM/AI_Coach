'use client'

import { useEffect, useRef, useState } from 'react'
import { Topbar } from '@/components/Topbar'
import {
  ChatMessage,
  audioUrl,
  resetConversation,
  sendAudio,
  sendText,
} from '@/lib/api'
import styles from './chat.module.css'

const AUDIO_PLAYED_KEY = 'ai-coach-last-audio'
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
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    setSessionId(getStoredSessionId())
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  function appendMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg])
  }

  function updateLastMessage(updater: Partial<ChatMessage>) {
    setMessages((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      next[next.length - 1] = { ...next[next.length - 1], ...updater }
      return next
    })
  }

  async function playAudio(url: string) {
    if (!url) return
    try {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      const fullUrl = audioUrl(url) || url
      const audio = new Audio(fullUrl)
      audioRef.current = audio
      setPlayingAudio(url)
      audio.onended = () => setPlayingAudio(null)
      audio.onerror = () => setPlayingAudio(null)
      await audio.play()
    } catch (err) {
      console.warn('Audio playback failed', err)
      setPlayingAudio(null)
    }
  }

  // Auto-play coach audio when a new message arrives with coach_audio_url
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'coach' || !last.coach_audio_url) return
    if (last.pending) return
    if (!sessionId) return
    const key = `${sessionId}:${last.coach_audio_url}`
    try {
      if (sessionStorage.getItem(AUDIO_PLAYED_KEY) === key) return
      sessionStorage.setItem(AUDIO_PLAYED_KEY, key)
      playAudio(last.coach_audio_url)
    } catch {
      playAudio(last.coach_audio_url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sessionId])

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
      updateLastMessage({
        text: res.coach_text,
        coach_audio_url: res.coach_audio_url,
        user_audio_url: res.user_audio_url,
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, {
          type: chunksRef.current[0]?.type || 'audio/webm',
        })
        await submitAudio(blob)
      }
      mr.start()
      setRecording(true)
    } catch (err: any) {
      console.error('mic error', err)
      setError('Microphone unavailable. Check browser permissions.')
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
    try {
      const res = await sendAudio(blob, sessionId)
      setMessages((prev) => {
        const next = [...prev]
        const userIdx = next.length - 2
        const coachIdx = next.length - 1
        if (userIdx >= 0 && next[userIdx].pending && next[userIdx].role === 'user') {
          next[userIdx] = {
            ...next[userIdx],
            text: res.user_text,
            user_audio_url: res.user_audio_url,
            pending: false,
          }
        }
        if (coachIdx >= 0) {
          next[coachIdx] = {
            ...next[coachIdx],
            text: res.coach_text,
            coach_audio_url: res.coach_audio_url,
            corrections: res.corrections,
            pending: false,
          }
        }
        return next
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

  return (
    <div className={styles.chatPage}>
      <Topbar />
      <main className={styles.chatMain}>
        <div className={styles.messagesArea}>
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyEmoji}>🎯</div>
              <div className={styles.emptyTitle}>Start a conversation</div>
              <div className={styles.emptyHint}>
                Type a message or hold the mic button to record audio. The COACH will reply in
                text and audio, with corrections filtered to your selected CEFR level.
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
                  {m.text}
                </div>
                <div className={styles.metaRow}>
                  {!m.pending && m.coach_audio_url && (
                    <button
                      className={`${styles.playBtn} ${
                        playingAudio === m.coach_audio_url ? styles.playing : ''
                      }`}
                      onClick={() => playAudio(m.coach_audio_url!)}
                      aria-label="Play coach reply audio"
                    >
                      {playingAudio === m.coach_audio_url ? '⏸' : '▶'} Coach audio
                    </button>
                  )}
                  {!m.pending && m.user_audio_url && (
                    <button
                      className={`${styles.playBtn} ${
                        playingAudio === m.user_audio_url ? styles.playing : ''
                      }`}
                      onClick={() => playAudio(m.user_audio_url!)}
                      aria-label="Play your audio back"
                    >
                      {playingAudio === m.user_audio_url ? '⏸' : '▶'} Your audio
                    </button>
                  )}
                  <span className={styles.timestamp}>
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
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
                  ? 'Recording...'
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
                ➤
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
                🎤
              </button>
            )}
          </div>
          {messages.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              <button
                onClick={handleReset}
                disabled={busy}
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                }}
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
