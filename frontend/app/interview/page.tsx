'use client'

import { useEffect, useRef, useState } from 'react'
import { AudioPlayer } from '@/components/AudioPlayer'
import { CoachIcon } from '@/components/icons/CoachIcon'
import { InterviewFeedbackModal } from '@/components/InterviewFeedbackModal'
import { InterviewFeedbackPanel } from '@/components/InterviewFeedbackPanel'
import { InterviewReportModal } from '@/components/InterviewReportModal'
import { InterviewSetupModal } from '@/components/InterviewSetupModal'
import { InterviewTopbar } from '@/components/InterviewTopbar'
import { LoadingIndicator } from '@/components/LoadingIndicator'
import {
  endInterview,
  getInterviewSession,
  getInterviewSkills,
  interviewAudioUrl,
  latestTurnFeedback,
  resetInterview,
  sendInterviewAudio,
  sendInterviewText,
  setupInterview,
} from '@/lib/interview-api'
import type {
  InterviewBrief,
  InterviewFeedback,
  InterviewMessage,
  InterviewReport,
  InterviewSkillInfo,
  InterviewType,
} from '@/types/interview'
import chat from '../chat.module.css'
import styles from './interview.module.css'

const SESSION_KEY = 'ai-interview-session-id'

const FALLBACK_SKILLS: InterviewSkillInfo[] = [
  {
    id: 'intro',
    title: 'Introduction',
    description: 'Recruiter screen: career story, motivation and fit for the role.',
    focus: 'Assess communication, relevance and motivation.',
  },
  {
    id: 'technical',
    title: 'Technical',
    description: 'Hands-on technical interview: depth, design, trade-offs and problem solving.',
    focus: 'Test real technical judgement.',
  },
  {
    id: 'final',
    title: 'Final',
    description: 'Hiring-manager round: ownership, leadership, collaboration and closing.',
    focus: 'Assess behaviour and leadership.',
  },
]

function getStoredSessionId(): string {
  if (typeof window === 'undefined') return crypto.randomUUID()
  let sid = localStorage.getItem(SESSION_KEY)
  if (!sid) {
    sid = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, sid)
  }
  return sid
}

function nowIso(): string {
  return new Date().toISOString()
}

function timeOf(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function InterviewPage() {
  const [sessionId, setSessionId] = useState('')
  const [skills, setSkills] = useState<InterviewSkillInfo[]>([])
  const [bootLoading, setBootLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [brief, setBrief] = useState<InterviewBrief | null>(null)
  const [interviewType, setInterviewType] = useState<InterviewType | null>(null)
  const [messages, setMessages] = useState<InterviewMessage[]>([])
  const [latestFeedback, setLatestFeedback] = useState<InterviewFeedback[]>([])
  const [latestStrengths, setLatestStrengths] = useState<string[]>([])
  const [latestScore, setLatestScore] = useState<number | null>(null)
  const [feedbackCount, setFeedbackCount] = useState(0)
  const [answerCount, setAnswerCount] = useState(0)
  const [messageLimit, setMessageLimit] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)

  const [setupOpen, setSetupOpen] = useState(false)
  const [setupBusy, setSetupBusy] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [report, setReport] = useState<InterviewReport | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const atLimit = messageLimit !== null && answerCount >= messageLimit

  useEffect(() => {
    const sid = getStoredSessionId()
    setSessionId(sid)

    let cancelled = false
    Promise.allSettled([getInterviewSkills(), getInterviewSession(sid)]).then(
      ([skillsResult, sessionResult]) => {
        if (cancelled) return

        if (skillsResult.status === 'fulfilled') {
          setSkills(skillsResult.value.skills ?? [])
          setMessageLimit(
            skillsResult.value.unlimited
              ? null
              : skillsResult.value.message_limit ?? null
          )
        } else {
          setSkills(FALLBACK_SKILLS)
          setMessageLimit(null)
        }

        if (sessionResult.status === 'fulfilled' && sessionResult.value.configured) {
          const session = sessionResult.value
          setConfigured(true)
          setBrief(session.brief ?? null)
          setInterviewType(session.interview_type ?? null)
          setMessages(session.messages ?? [])
          setFeedbackCount(session.feedback?.length ?? 0)
          setAnswerCount(session.turn ?? 0)
          setLatestFeedback(latestTurnFeedback(session.feedback ?? []))
          setLatestStrengths(
            session.latest_strengths?.length
              ? session.latest_strengths
              : session.strengths ?? []
          )
          const scores = session.answer_scores ?? []
          setLatestScore(scores.length ? scores[scores.length - 1] : null)
          setReport(session.report ?? null)
          setSetupOpen(false)
        } else {
          setSetupOpen(true)
        }

        setBootLoading(false)
      }
    )

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  function appendMessages(...items: InterviewMessage[]) {
    setMessages((prev) => [...prev, ...items])
  }

  function updateMessageAt(index: number, updater: Partial<InterviewMessage>) {
    setMessages((prev) => {
      const next = [...prev]
      if (index < 0 || index >= next.length) return prev
      next[index] = { ...next[index], ...updater }
      return next
    })
  }

  function removeMessagesAt(...indices: number[]) {
    setMessages((prev) => prev.filter((_, index) => !indices.includes(index)))
  }

  async function handleSetup(payload: {
    interviewType: InterviewType
    jobText?: string
    jobFile?: File
  }) {
    if (!sessionId) return
    setSetupBusy(true)
    setSetupError(null)
    setError(null)
    try {
      const result = await setupInterview({
        sessionId,
        interviewType: payload.interviewType,
        jobText: payload.jobText,
        jobFile: payload.jobFile,
      })
      setConfigured(true)
      setBrief(result.brief)
      setInterviewType(result.interview_type)
      setMessages([
        {
          role: 'interviewer',
          text: result.opening_message,
          audio_url: result.opening_audio_url,
          timestamp: nowIso(),
        },
      ])
      setLatestFeedback([])
      setLatestStrengths([])
      setLatestScore(null)
      setFeedbackCount(0)
      setAnswerCount(0)
      setReport(null)
      setSetupOpen(false)
    } catch (err: any) {
      console.error('interview setup error', err)
      setSetupError(err?.message || 'Could not prepare the interview. Please try again.')
    } finally {
      setSetupBusy(false)
    }
  }

  function classifyError(err: any, fallback: string): string {
    const message = err?.message || fallback
    if (message.toLowerCase().includes('limit')) return message
    return message
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text || busy || !configured || atLimit || recording || !sessionId) return
    setError(null)
    setInput('')

    const userIdx = messages.length
    const coachIdx = messages.length + 1
    appendMessages(
      { role: 'candidate', text, timestamp: nowIso(), pending: false },
      { role: 'interviewer', text: '', timestamp: nowIso(), pending: true }
    )
    setBusy(true)

    try {
      const result = await sendInterviewText(text, sessionId)
      updateMessageAt(userIdx, {
        audio_url: result.user_audio_url,
        pending: false,
      })
      updateMessageAt(coachIdx, {
        text: result.interviewer_text,
        audio_url: result.interviewer_audio_url,
        pending: false,
      })
      setLatestFeedback(result.feedback ?? [])
      setLatestStrengths(result.strengths ?? [])
      setLatestScore(result.answer_score ?? null)
      setFeedbackCount((prev) => prev + (result.feedback?.length ?? 0))
      setAnswerCount((prev) => prev + 1)
    } catch (err: any) {
      console.error('interview send error', err)
      setError(classifyError(err, 'Failed to send your answer'))
      removeMessagesAt(userIdx, coachIdx)
      if (!textOverride) setInput(text)
    } finally {
      setBusy(false)
    }
  }

  async function startRecording() {
    if (busy || !configured || atLimit || !sessionId) return
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
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const producedType = chunksRef.current[0]?.type || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: producedType })
        await submitAudio(blob)
      }
      recorder.start()
      setRecording(true)
    } catch (err: any) {
      console.error('interview mic error', err)
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow access in the browser.'
          : 'Microphone unavailable. Check browser permissions.'
      )
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    setRecording(false)
  }

  async function submitAudio(blob: Blob) {
    if (!sessionId || atLimit || busy) return
    setBusy(true)
    setError(null)

    const userIdx = messages.length
    const coachIdx = messages.length + 1
    appendMessages(
      {
        role: 'candidate',
        text: '🎤 (transcribing...)',
        timestamp: nowIso(),
        pending: true,
      },
      { role: 'interviewer', text: '', timestamp: nowIso(), pending: true }
    )

    try {
      const result = await sendInterviewAudio(blob, sessionId)
      updateMessageAt(userIdx, {
        text: result.user_text,
        audio_url: result.user_audio_url,
        pending: false,
      })
      updateMessageAt(coachIdx, {
        text: result.interviewer_text,
        audio_url: result.interviewer_audio_url,
        pending: false,
      })
      setLatestFeedback(result.feedback ?? [])
      setLatestStrengths(result.strengths ?? [])
      setLatestScore(result.answer_score ?? null)
      setFeedbackCount((prev) => prev + (result.feedback?.length ?? 0))
      setAnswerCount((prev) => prev + 1)
    } catch (err: any) {
      console.error('interview audio error', err)
      setError(classifyError(err, 'Failed to send your answer'))
      removeMessagesAt(userIdx, coachIdx)
    } finally {
      setBusy(false)
    }
  }

  async function handleEndInterview() {
    if (!sessionId || busy || ending || recording || !configured) return
    if (answerCount === 0) {
      setError('Answer at least one question before ending the interview.')
      return
    }
    setEnding(true)
    setError(null)
    try {
      const result = await endInterview(sessionId)
      setReport(result)
      setReportOpen(true)
    } catch (err: any) {
      console.error('interview report error', err)
      setError(err?.message || 'Failed to generate the report')
    } finally {
      setEnding(false)
    }
  }

  async function handleNewInterview() {
    if (!sessionId || busy || ending || recording) return
    if (
      configured &&
      !window.confirm('Start a new interview? The current conversation will be cleared.')
    ) {
      return
    }
    try {
      if (configured) await resetInterview(sessionId, false)
    } catch (err: any) {
      setError(err?.message || 'Failed to reset the interview')
      return
    }
    setReportOpen(false)
    setReport(null)
    setConfigured(false)
    setBrief(null)
    setInterviewType(null)
    setMessages([])
    setLatestFeedback([])
    setLatestStrengths([])
    setLatestScore(null)
    setFeedbackCount(0)
    setAnswerCount(0)
    setSetupError(null)
    setSetupOpen(true)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!atLimit) send()
    }
  }

  return (
    <div className={chat.chatPage}>
      <div className={chat.topbarZone}>
        <InterviewTopbar
          roleTitle={brief?.role_title}
          company={brief?.company}
          interviewType={interviewType}
          feedbackCount={feedbackCount}
          ending={ending}
          onOpenFeedback={() => setFeedbackOpen(true)}
          onEndInterview={handleEndInterview}
          onNewInterview={handleNewInterview}
        />
      </div>

      <main className={chat.chatMain}>
        <div className={chat.messagesArea}>
          {bootLoading ? (
            <div className={chat.empty}>
              <LoadingIndicator />
              <div className={chat.emptyHint}>Loading your interview…</div>
            </div>
          ) : messages.length === 0 ? (
            <div className={chat.empty}>
              <div className={chat.emptyEmoji}>
                <CoachIcon size={64} />
              </div>
              <div className={chat.emptyTitle}>Set up your interview</div>
              <div className={chat.emptyHint}>
                Add the job offer and choose Introduction, Technical or Final. The
                interviewer will simulate the conversation and coach every answer.
              </div>
              <button
                type="button"
                className={styles.setupCta}
                onClick={() => setSetupOpen(true)}
              >
                Add a job offer
              </button>
            </div>
          ) : (
            messages.map((message, index) => {
              const isCandidate = message.role === 'candidate'
              return (
                <div
                  key={index}
                  className={`${chat.message} ${
                    isCandidate ? chat.messageUser : chat.messageCoach
                  }`}
                >
                  {!isCandidate && (
                    <span className={styles.speaker}>
                      Interviewer
                      {brief?.role_title ? ` · ${brief.role_title}` : ''}
                    </span>
                  )}
                  <div
                    className={`${chat.bubble} ${
                      isCandidate ? chat.bubbleUser : chat.bubbleCoach
                    }`}
                    data-pending={message.pending ? 'true' : 'false'}
                  >
                    {message.pending && !message.text ? (
                      <LoadingIndicator />
                    ) : message.text ? (
                      <div className={chat.bubbleText}>{message.text}</div>
                    ) : null}

                    {!message.pending && message.audio_url && (
                      <div
                        className={`${chat.bubbleAudio} ${
                          isCandidate ? chat.bubbleUser : chat.bubbleCoach
                        }`}
                        data-audio-bubble={isCandidate ? 'user' : 'coach'}
                      >
                        <AudioPlayer
                          src={interviewAudioUrl(message.audio_url) || message.audio_url}
                          variant={isCandidate ? 'user' : 'coach'}
                        />
                      </div>
                    )}

                    <div className={chat.bubbleMeta}>
                      {message.pending && (
                        <span className={chat.pendingDot} aria-hidden="true" />
                      )}
                      <span className={chat.timestamp}>
                        {timeOf(message.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className={chat.errorBanner} role="alert">
            <span>⚠️ {error}</span>
            <button type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {configured &&
          (latestFeedback.length > 0 || latestScore !== null) && (
            <InterviewFeedbackPanel
              feedback={latestFeedback}
              strengths={latestStrengths}
              answerScore={latestScore}
            />
          )}

        {configured && (
          <div className={chat.inputArea}>
            <div
              className={`${chat.inputWrapper} ${
                atLimit ? chat.inputBlocked : ''
              }`}
            >
              <textarea
                className={chat.textInput}
                placeholder={
                  atLimit
                    ? 'Practice limit reached. Start a new interview to continue.'
                    : 'Type your answer — Enter to send, Shift+Enter for a new line'
                }
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                disabled={atLimit || busy || recording}
                aria-label="Your answer"
              />
              {input.trim().length > 0 ? (
                <button
                  type="button"
                  className={`${chat.iconBtn} ${chat.sendBtn}`}
                  onClick={() => send()}
                  disabled={busy || atLimit || recording}
                  aria-label="Send answer"
                  title="Send (Enter)"
                >
                  <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
                    <path d="M2 8l12-6-3 14-3-6-6-2z" fill="currentColor" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className={`${chat.iconBtn} ${chat.micBtn}`}
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={() => recording && stopRecording()}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  disabled={busy || atLimit}
                  data-recording={recording ? 'true' : 'false'}
                  aria-label={
                    recording ? 'Recording — release to send' : 'Hold to record your answer'
                  }
                  title="Hold to record your answer"
                >
                  <svg
                    viewBox="0 0 16 16"
                    width="18"
                    height="18"
                    aria-hidden="true"
                    fill="currentColor"
                  >
                    <path d="M8 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3zM3 8a5 5 0 0010 0h-1a4 4 0 11-8 0H3zM8 13a1 1 0 011 1v1H7v-1a1 1 0 011-1z" />
                  </svg>
                </button>
              )}
            </div>
            {atLimit && (
              <p className={chat.inputBlockedMessage}>
                Practice limit reached. Start a new interview to keep going.
              </p>
            )}
            <div className={chat.resetRow}>
              <button
                type="button"
                className={chat.resetBtn}
                onClick={handleNewInterview}
                disabled={busy}
              >
                Start a new interview
              </button>
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className={chat.resetBtn}
                onClick={handleEndInterview}
                disabled={busy || ending}
              >
                {ending ? 'Preparing report…' : 'End interview and get report'}
              </button>
            </div>
          </div>
        )}
      </main>

      <InterviewSetupModal
        open={setupOpen}
        skills={skills.length ? skills : FALLBACK_SKILLS}
        initialType={interviewType ?? undefined}
        canClose={configured}
        busy={setupBusy}
        error={setupError}
        onClearError={() => setSetupError(null)}
        onClose={() => {
          if (configured) setSetupOpen(false)
        }}
        onSubmit={handleSetup}
      />

      <InterviewFeedbackModal
        open={feedbackOpen}
        sessionId={sessionId}
        onClose={() => setFeedbackOpen(false)}
      />

      <InterviewReportModal
        open={reportOpen}
        report={report}
        onClose={() => setReportOpen(false)}
        onNewInterview={async () => {
          setReportOpen(false)
          await handleNewInterview()
        }}
      />
    </div>
  )
}
