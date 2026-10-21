import { render, screen } from '@testing-library/react'
import { InterviewFeedbackPanel } from '@/components/InterviewFeedbackPanel'
import type { InterviewFeedback } from '@/types/interview'

const FEEDBACK: InterviewFeedback = {
  id: 'f1',
  turn: 1,
  question: 'Tell me about a production incident.',
  category: 'impact',
  severity: 'major',
  evidence: 'We fixed it quickly.',
  issue: 'No measurable outcome was given.',
  why_it_matters: 'Impact is the main signal for this role.',
  better_answer: 'State the latency before and after and your own contribution.',
  timestamp: '2026-01-01T10:00:00+00:00',
}

describe('InterviewFeedbackPanel', () => {
  it('shows the score, strengths and coaching sections', () => {
    render(
      <InterviewFeedbackPanel
        feedback={[FEEDBACK]}
        strengths={['Clear ownership']}
        answerScore={3}
      />
    )
    expect(screen.getByText('Answer review')).toBeInTheDocument()
    expect(screen.getByLabelText('Answer score 3 out of 5')).toBeInTheDocument()
    expect(screen.getByText('Clear ownership')).toBeInTheDocument()
    expect(screen.getByText('What went wrong')).toBeInTheDocument()
    expect(screen.getByText('No measurable outcome was given.')).toBeInTheDocument()
    expect(screen.getByText('Why it matters')).toBeInTheDocument()
    expect(screen.getByText('Stronger answer')).toBeInTheDocument()
    expect(
      screen.getByText('State the latency before and after and your own contribution.')
    ).toBeInTheDocument()
  })

  it('shows the no-mistakes message when feedback is empty', () => {
    render(
      <InterviewFeedbackPanel feedback={[]} strengths={[]} answerScore={5} />
    )
    expect(screen.getByText(/no major mistakes/i)).toBeInTheDocument()
  })
})
