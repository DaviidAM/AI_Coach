import { render, screen } from '@testing-library/react'
import { InterviewFeedbackModal } from '@/components/InterviewFeedbackModal'
import * as interviewApi from '@/lib/interview-api'

jest.mock('@/lib/interview-api', () => ({
  getInterviewFeedback: jest.fn(),
}))

const api = interviewApi as jest.Mocked<typeof interviewApi>

const FEEDBACK = [
  {
    id: 'f1',
    turn: 1,
    question: 'Tell me about a project.',
    category: 'impact',
    severity: 'major',
    evidence: 'We improved it.',
    issue: 'No measurable outcome.',
    why_it_matters: 'Impact is the main signal.',
    better_answer: 'State the latency before and after.',
    timestamp: '2026-01-01T10:00:00+00:00',
  },
  {
    id: 'f2',
    turn: 2,
    question: 'Tell me about a conflict.',
    category: 'leadership',
    severity: 'critical',
    evidence: 'The team disagreed.',
    issue: 'No personal action was described.',
    why_it_matters: 'Interviewers need your contribution.',
    better_answer: 'Explain what you said and changed.',
    timestamp: '2026-01-01T10:05:00+00:00',
  },
]

describe('InterviewFeedbackModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.getInterviewFeedback.mockResolvedValue({ feedback: FEEDBACK, total: 2 })
  })

  it('groups feedback by answer and shows the coaching fields', async () => {
    render(
      <InterviewFeedbackModal open sessionId="s1" onClose={jest.fn()} />
    )

    expect(await screen.findByText('Answer 1')).toBeInTheDocument()
    expect(screen.getByText('Answer 2')).toBeInTheDocument()
    expect(screen.getByText('No measurable outcome.')).toBeInTheDocument()
    expect(screen.getByText('No personal action was described.')).toBeInTheDocument()
    expect(screen.getByText('State the latency before and after.')).toBeInTheDocument()
    expect(screen.getByText('2 coaching notes across this interview.')).toBeInTheDocument()
  })

  it('shows an empty state when no feedback exists', async () => {
    api.getInterviewFeedback.mockResolvedValue({ feedback: [], total: 0 })
    render(
      <InterviewFeedbackModal open sessionId="s1" onClose={jest.fn()} />
    )
    expect(
      await screen.findByText(/No feedback yet/i)
    ).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <InterviewFeedbackModal open={false} sessionId="s1" onClose={jest.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
    expect(api.getInterviewFeedback).not.toHaveBeenCalled()
  })
})
