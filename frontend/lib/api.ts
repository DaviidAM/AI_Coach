import { Level } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Correction {
  id?: string
  original_phrase: string
  corrected_phrase: string
  explanation: string
  error_level: string
  category?: string
  timestamp?: string
}

export interface ChatMessage {
  role: 'user' | 'coach'
  text: string
  user_audio_url?: string
  coach_audio_url?: string
  corrections?: Correction[]
  timestamp: number
  pending?: boolean
}

export interface ChatResponse {
  session_id: string
  user_text: string
  user_audio_url?: string
  coach_text: string
  coach_audio_url?: string
  corrections: Correction[]
}

export interface Settings {
  provider: 'minimax' | 'openai' | 'anthropic' | 'groq'
  model: string
}

export async function getLevel(sessionId?: string): Promise<Level> {
  const url = sessionId
    ? `${API_BASE}/api/level?session_id=${encodeURIComponent(sessionId)}`
    : `${API_BASE}/api/level`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch level')
  const data = await res.json()
  return data.level as Level
}

export async function setLevel(level: Level, sessionId?: string): Promise<void> {
  const url = sessionId
    ? `${API_BASE}/api/level?session_id=${encodeURIComponent(sessionId)}`
    : `${API_BASE}/api/level`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  })
  if (!res.ok) throw new Error('Failed to set level')
}

export async function sendText(text: string, sessionId?: string): Promise<ChatResponse> {
  const form = new FormData()
  form.append('text', text)
  if (sessionId) form.append('session_id', sessionId)
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Chat failed: ${err}`)
  }
  return res.json()
}

export async function sendAudio(audioBlob: Blob, sessionId?: string): Promise<ChatResponse> {
  const form = new FormData()
  // Backend accepts: audio/mpeg, audio/wav, audio/ogg, audio/webm, audio/mp4
  const ext = guessExtension(audioBlob.type)
  form.append('audio', audioBlob, `recording.${ext}`)
  if (sessionId) form.append('session_id', sessionId)
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Chat failed: ${err}`)
  }
  return res.json()
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

export async function getCorrections(
  sessionId: string,
  limit = 50,
  offset = 0
): Promise<Correction[]> {
  const params = new URLSearchParams({
    session_id: sessionId,
    limit: String(limit),
    offset: String(offset),
  })
  const res = await fetch(`${API_BASE}/api/corrections?${params}`)
  if (!res.ok) throw new Error('Failed to fetch corrections')
  const data = await res.json()
  return data.corrections || []
}

export async function resetConversation(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversation/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  if (!res.ok) throw new Error('Failed to reset conversation')
}

export async function getSettings(sessionId: string): Promise<Settings> {
  const res = await fetch(
    `${API_BASE}/api/settings?session_id=${encodeURIComponent(sessionId)}`
  )
  if (!res.ok) {
    if (res.status === 404) {
      return { provider: 'minimax', model: 'MiniMax-Text-01' }
    }
    throw new Error('Failed to fetch settings')
  }
  return res.json()
}

export async function setSettings(sessionId: string, settings: Settings): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/settings?session_id=${encodeURIComponent(sessionId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }
  )
  if (!res.ok) throw new Error('Failed to save settings')
}

export function audioUrl(relativeUrl?: string): string | undefined {
  if (!relativeUrl) return undefined
  if (relativeUrl.startsWith('http')) return relativeUrl
  return `${API_BASE}${relativeUrl}`
}

export function generateSessionId(): string {
  return crypto.randomUUID()
}
