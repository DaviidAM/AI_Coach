export type InterviewType = 'intro' | 'technical' | 'final'

export interface InterviewSkillInfo {
  id: InterviewType
  title: string
  description: string
  focus: string
}

export interface InterviewSkillsResponse {
  skills: InterviewSkillInfo[]
  message_limit: number | null
  unlimited: boolean
}

export interface InterviewBrief {
  role_title: string
  company: string
  seniority: string
  role_track: string
  key_skills: string[]
  offer_digest: string
}

export type FeedbackCategory =
  | 'structure'
  | 'relevance'
  | 'depth'
  | 'technical_accuracy'
  | 'communication'
  | 'impact'
  | 'leadership'
  | 'tradeoffs'
  | 'problem_solving'
  | 'culture_fit'
  | 'closing'
  | 'other'

export type FeedbackSeverity = 'critical' | 'major' | 'minor'

export interface InterviewFeedback {
  id: string
  turn: number
  question: string
  category: FeedbackCategory | string
  severity: FeedbackSeverity | string
  evidence: string
  issue: string
  why_it_matters: string
  better_answer: string
  timestamp: string
}

export interface InterviewMessage {
  role: 'interviewer' | 'candidate'
  text: string
  audio_url?: string | null
  timestamp?: string | null
  pending?: boolean
}

export interface InterviewSetupResponse {
  session_id: string
  interview_type: InterviewType
  brief: InterviewBrief
  opening_message: string
  opening_audio_url?: string | null
  turn: number
}

export interface InterviewTurnResponse {
  session_id: string
  user_text: string
  user_audio_url?: string | null
  interviewer_text: string
  interviewer_audio_url?: string | null
  feedback: InterviewFeedback[]
  strengths: string[]
  answer_score: number
  turn: number
}

export interface InterviewSessionResponse {
  configured: boolean
  session_id: string
  interview_type?: InterviewType | null
  brief?: InterviewBrief | null
  messages: InterviewMessage[]
  feedback: InterviewFeedback[]
  strengths: string[]
  latest_strengths: string[]
  turn: number
  answer_scores: number[]
  report?: InterviewReport | null
}

export interface InterviewReport {
  overall_score: number
  readiness: 'not_ready' | 'getting_there' | 'interview_ready' | string
  summary: string
  strengths: string[]
  gaps: string[]
  next_steps: string[]
  questions_answered: number
}

export interface InterviewFeedbackHistory {
  feedback: InterviewFeedback[]
  total: number
}
