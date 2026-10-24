import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import InterviewPage from '@/app/interview/page'
import * as interviewApi from '@/lib/interview-api'

jest.mock('@/lib/interview-api', () => ({
  getInterviewSkills: jest.fn(),
  getInterviewSession: jest.fn(),
  setupInterview: jest.fn(),
  sendInterviewText: jest.fn(),
  sendInterviewAudio: jest.fn(),
  endInterview: jest.fn(),
  resetInterview: jest.fn(),
  interviewAudioUrl: jest.fn((url: string | null | undefined) => url ?? undefined),
  latestTurnFeedback: jest.fn((feedback: unknown[]) => feedback),
}))

const api = interviewApi as jest.Mocked<typeof interviewApi>

const SKILLS = {
  skills: [
    {
      id: 'intro' as const,
      title: 'Introduction',
      description: 'Recruiter screen.',
      focus: 'Fit',
    },
    {
      id: 'technical' as const,
      title: 'Technical',
      description: 'Deep technical round.',
      focus: 'Depth',
    },
    {
      id: 'final' as const,
      title: 'Final',
      description: 'Hiring manager round.',
      focus: 'Behaviour',
    },
  ],
  message_limit: 20,
  unlimited: false,
}

const BRIEF = {
  role_title: 'Senior Backend Engineer',
  company: 'Acme',
  seniority: 'senior',
  role_track: 'software_engineering',
  key_skills: ['Python', 'AWS'],
  offer_digest: 'Build reliable services.',
}

describe('InterviewPage', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn()
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: () => 'test-interview-session' },
      configurable: true,
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    api.getInterviewSkills.mockResolvedValue(SKILLS)
    api.getInterviewSession.mockResolvedValue({
      configured: false,
      session_id: 'test-interview-session',
      messages: [],
      feedback: [],
      strengths: [],
      latest_strengths: [],
      turn: 0,
      answer_scores: [],
    })
  })

  it('forces setup on entry and starts the tailored interview', async () => {
    api.setupInterview.mockResolvedValue({
      session_id: 'test-interview-session',
      interview_type: 'technical',
      brief: BRIEF,
      opening_message:
        'Hi, I am the technical interviewer. Walk me through your most relevant project.',
      opening_audio_url: null,
      turn: 0,
    })

    render(<InterviewPage />)

    expect(
      await screen.findByRole('heading', { name: 'Set up your interview' })
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Job offer text'), {
      target: { value: 'Senior Backend Engineer at Acme. Python and AWS.' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /technical/i }))
    fireEvent.click(screen.getByRole('button', { name: /start interview/i }))

    await waitFor(() => {
      expect(api.setupInterview).toHaveBeenCalledWith({
        sessionId: 'test-interview-session',
        interviewType: 'technical',
        jobText: 'Senior Backend Engineer at Acme. Python and AWS.',
        jobFile: undefined,
      })
    })

    expect(
      await screen.findByText(
        'Hi, I am the technical interviewer. Walk me through your most relevant project.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Set up your interview' })
    ).not.toBeInTheDocument()
    expect(screen.getAllByText(/Senior Backend Engineer/).length).toBeGreaterThan(0)
  })

  it('removes the optimistic messages and restores the text when sending fails', async () => {
    api.setupInterview.mockResolvedValue({
      session_id: 'test-interview-session',
      interview_type: 'technical',
      brief: BRIEF,
      opening_message: 'Tell me about a project.',
      opening_audio_url: null,
      turn: 0,
    })
    api.sendInterviewText.mockRejectedValue(new Error('Network down'))

    render(<InterviewPage />)
    await screen.findByRole('heading', { name: 'Set up your interview' })
    fireEvent.change(screen.getByLabelText('Job offer text'), {
      target: { value: 'Senior Backend Engineer at Acme.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /start interview/i }))
    await screen.findByText('Tell me about a project.')

    const input = screen.getByLabelText('Your answer')
    fireEvent.change(input, { target: { value: 'My unfinished answer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }))

    expect(await screen.findByText(/Network down/)).toBeInTheDocument()
    expect(screen.getAllByText('My unfinished answer')).toHaveLength(1)
    expect(input).toHaveValue('My unfinished answer')
    expect(screen.getByText('Tell me about a project.')).toBeInTheDocument()
  })

  it('sends an answer and renders per-answer coaching', async () => {
    api.setupInterview.mockResolvedValue({
      session_id: 'test-interview-session',
      interview_type: 'technical',
      brief: BRIEF,
      opening_message: 'Tell me about a project.',
      opening_audio_url: null,
      turn: 0,
    })
    api.sendInterviewText.mockResolvedValue({
      session_id: 'test-interview-session',
      user_text: 'I improved the service a lot.',
      user_audio_url: null,
      interviewer_text: 'What was the measurable outcome?',
      interviewer_audio_url: null,
      feedback: [
        {
          id: 'f1',
          turn: 1,
          question: 'Tell me about a project.',
          category: 'impact',
          severity: 'major',
          evidence: 'I improved the service a lot.',
          issue: 'No measurable outcome was given.',
          why_it_matters: 'Impact is the main signal for this role.',
          better_answer: 'State the latency before and after.',
          timestamp: '2026-01-01T10:00:00+00:00',
        },
      ],
      strengths: ['Clear ownership'],
      answer_score: 3,
      turn: 1,
    })

    render(<InterviewPage />)
    await screen.findByRole('heading', { name: 'Set up your interview' })
    fireEvent.change(screen.getByLabelText('Job offer text'), {
      target: { value: 'Senior Backend Engineer at Acme.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /start interview/i }))
    await screen.findByText('Tell me about a project.')

    fireEvent.change(screen.getByLabelText('Your answer'), {
      target: { value: 'I improved the service a lot.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }))

    await waitFor(() => {
      expect(api.sendInterviewText).toHaveBeenCalledWith(
        'I improved the service a lot.',
        'test-interview-session'
      )
    })
    expect(await screen.findByText('No measurable outcome was given.')).toBeInTheDocument()
    expect(screen.getByText('What was the measurable outcome?')).toBeInTheDocument()
    expect(screen.getByText('Clear ownership')).toBeInTheDocument()
    expect(screen.getByLabelText('Answer score 3 out of 5')).toBeInTheDocument()
  })
})
