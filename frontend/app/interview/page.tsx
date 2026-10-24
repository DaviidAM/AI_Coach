'use client'

import { useEffect, useState } from 'react'
import { RobotIcon } from '@/components/icons/AppIcons'
import { InterviewFeedbackModal } from '@/components/InterviewFeedbackModal'
import { InterviewFeedbackPanel } from '@/components/InterviewFeedbackPanel'
import { InterviewReportModal } from '@/components/InterviewReportModal'
import { InterviewSetupModal } from '@/components/InterviewSetupModal'
import { InterviewTopbar } from '@/components/InterviewTopbar'
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

function nowIso(): string {
  return new Date().toISOString()
}

export default function InterviewPage() {
  const sessionId = useStoredSessionId(SESSION_KEY)
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

  const [setupOpen, setSetupOpen] = useState(false)
  const [setupBusy, setSetupBusy] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [report, setReport] = useState<InterviewReport | null>(null)

  const atLimit = messageLimit !== null && answerCount >= messageLimit

  const { recording, startRecording, stopRecording } = useAudioRecorder({
    enabled: configured && Boolean(sessionId) && !busy && !atLimit,
    onAudio: submitAudio,
    onError: setError,
  })

  useEffect(() => {
    if (!sessionId) return

    let cancelled = false
    Promise.allSettled([getInterviewSkills(), getInterviewSession(sessionId)]).then(
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
  }, [sessionId])

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
    return err?.message || fallback
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

  function handleStartRecording() {
    setError(null)
    startRecording()
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

  const messageViews: ChatMessageView[] = messages.map((message, index) => {
    const isCandidate = message.role === 'candidate'
    return {
      id: index,
      role: isCandidate ? 'user' : 'coach',
      text: message.text,
      audioSrc: message.audio_url
        ? interviewAudioUrl(message.audio_url) || message.audio_url
        : undefined,
      audioLabel: isCandidate ? 'You' : 'Interviewer',
      timestamp: message.timestamp,
      pending: message.pending,
      pendingLabel: 'Interviewer is typing…',
      speakerLabel: isCandidate ? undefined : 'Interviewer',
    }
  })

  return (
    <>
      <ChatShell
        topbar={
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
        }
      >
        <ChatMessageList
          messages={messageViews}
          loading={bootLoading}
          loadingLabel="Loading your interview…"
          emptyState={
            <ChatEmptyState
              icon={<RobotIcon size={64} />}
              title="Set up your interview"
              hint="Add the job offer and choose Introduction, Technical or Final. The interviewer will simulate the conversation and coach every answer."
              action={
                <button
                  type="button"
                  className={styles.setupCta}
                  onClick={() => setSetupOpen(true)}
                >
                  Add a job offer
                </button>
              }
            />
          }
        />

        <ChatErrorBanner message={error} onDismiss={() => setError(null)} />

        {configured &&
          (latestFeedback.length > 0 || latestScore !== null) && (
            <InterviewFeedbackPanel
              feedback={latestFeedback}
              strengths={latestStrengths}
              answerScore={latestScore}
            />
          )}

        {configured && (
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={() => send()}
            placeholder="Type your answer — Enter to send, Shift+Enter for a new line"
            limitPlaceholder="Practice limit reached. Start a new interview to continue."
            limitMessage="Practice limit reached. Start a new interview to keep going."
            inputLabel="Your answer"
            sendAriaLabel="Send answer"
            recordAriaLabel="Hold to record your answer"
            recordingAriaLabel="Recording — release to send"
            busy={busy}
            atLimit={atLimit}
            disabled={atLimit || busy || recording}
            recording={recording}
            onStartRecording={handleStartRecording}
            onStopRecording={stopRecording}
          />
        )}
      </ChatShell>

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
    </>
  )
}
