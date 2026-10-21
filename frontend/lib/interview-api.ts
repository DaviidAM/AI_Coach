import { audioUrl } from '@/lib/api'
import type {
  InterviewFeedback,
  InterviewFeedbackHistory,
  InterviewReport,
  InterviewSessionResponse,
  InterviewSetupResponse,
  InterviewSkillsResponse,
  InterviewTurnResponse,
  InterviewType,
} from '@/types/interview'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) {
      return data.detail.map((item: any) => item?.msg ?? String(item)).join(', ')
    }
  } catch {
    // not JSON
  }
  try {
    const text = await res.text()
    if (text) return text
  } catch {
    // ignore
  }
  return fallback
}

export async function getInterviewSkills(): Promise<InterviewSkillsResponse> {
  const res = await fetch(`${API_BASE}/api/interview/skills`)
  if (!res.ok) throw new Error(await readError(res, 'Failed to load interview types'))
  return res.json()
}

export async function setupInterview(params: {
  sessionId: string
  interviewType: InterviewType
  jobText?: string
  jobFile?: File
}): Promise<InterviewSetupResponse> {
  const form = new FormData()
  form.append('session_id', params.sessionId)
  form.append('interview_type', params.interviewType)
  if (params.jobFile) {
    form.append('job_file', params.jobFile)
  } else if (params.jobText) {
    form.append('job_text', params.jobText)
  }

  const res = await fetch(`${API_BASE}/api/interview/setup`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(await readError(res, 'Failed to prepare the interview'))
  return res.json()
}

export async function getInterviewSession(
  sessionId: string
): Promise<InterviewSessionResponse> {
  const res = await fetch(
    `${API_BASE}/api/interview/session?session_id=${encodeURIComponent(sessionId)}`
  )
  if (!res.ok) throw new Error(await readError(res, 'Failed to load the interview'))
  return res.json()
}

export async function sendInterviewText(
  text: string,
  sessionId: string
): Promise<InterviewTurnResponse> {
  const form = new FormData()
  form.append('text', text)
  form.append('session_id', sessionId)
  const res = await fetch(`${API_BASE}/api/interview/chat`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(await readError(res, 'Failed to send your answer'))
  return res.json()
}

export async function sendInterviewAudio(
  audioBlob: Blob,
  sessionId: string
): Promise<InterviewTurnResponse> {
  const form = new FormData()
  const ext = guessExtension(audioBlob.type)
  form.append('audio', audioBlob, `answer.${ext}`)
  form.append('session_id', sessionId)
  const res = await fetch(`${API_BASE}/api/interview/chat`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(await readError(res, 'Failed to send your answer'))
  return res.json()
}

export async function getInterviewFeedback(
  sessionId: string,
  limit = 50,
  offset = 0
): Promise<InterviewFeedbackHistory> {
  const params = new URLSearchParams({
    session_id: sessionId,
    limit: String(limit),
    offset: String(offset),
  })
  const res = await fetch(`${API_BASE}/api/interview/feedback?${params}`)
  if (!res.ok) throw new Error(await readError(res, 'Failed to load feedback'))
  return res.json()
}

export async function endInterview(sessionId: string): Promise<InterviewReport> {
  const res = await fetch(
    `${API_BASE}/api/interview/report?session_id=${encodeURIComponent(sessionId)}`,
    { method: 'POST' }
  )
  if (!res.ok) throw new Error(await readError(res, 'Failed to generate the report'))
  return res.json()
}

export async function resetInterview(
  sessionId: string,
  keepSetup = true
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/interview/reset?session_id=${encodeURIComponent(
      sessionId
    )}&keep_setup=${keepSetup ? 'true' : 'false'}`,
    { method: 'POST' }
  )
  if (!res.ok) throw new Error(await readError(res, 'Failed to reset the interview'))
}

export function interviewAudioUrl(relativeUrl?: string | null): string | undefined {
  return audioUrl(relativeUrl || undefined)
}

function guessExtension(mime: string): string {
  if (!mime) return 'webm'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('mpeg')) return 'mp3'
  return 'webm'
}

export function latestTurnFeedback(feedback: InterviewFeedback[]): InterviewFeedback[] {
  if (!feedback.length) return []
  const latestTurn = Math.max(...feedback.map((item) => item.turn ?? 0))
  return feedback.filter((item) => (item.turn ?? 0) === latestTurn)
}
