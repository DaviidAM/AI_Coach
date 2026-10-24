import { fireEvent, render, screen } from '@testing-library/react'
import { InterviewReportModal } from '@/components/InterviewReportModal'
import type { InterviewReport } from '@/types/interview'

const REPORT: InterviewReport = {
  overall_score: 3.5,
  readiness: 'getting_there',
  summary: 'Strong communication, but answers need measurable outcomes.',
  strengths: ['Clear ownership', 'Good structure'],
  gaps: ['No metrics', 'Shallow trade-offs'],
  next_steps: ['Add a metric to each story', 'Practise design trade-offs'],
  questions_answered: 4,
}

describe('InterviewReportModal', () => {
  it('renders the score, readiness and coaching plan', () => {
    render(
      <InterviewReportModal
        open
        report={REPORT}
        onClose={jest.fn()}
        onNewInterview={jest.fn()}
      />
    )
    expect(screen.getByText('Interview practice report')).toBeInTheDocument()
    expect(screen.getByText('3.5')).toBeInTheDocument()
    expect(screen.getByText('Getting there')).toBeInTheDocument()
    expect(screen.getByText('Clear ownership')).toBeInTheDocument()
    expect(screen.getByText('No metrics')).toBeInTheDocument()
    expect(screen.getByText('Add a metric to each story')).toBeInTheDocument()
    expect(screen.getByText(/4 answers/i)).toBeInTheDocument()
  })

  it('calls the new-interview handler from the footer', () => {
    const onNewInterview = jest.fn()
    render(
      <InterviewReportModal
        open
        report={REPORT}
        onClose={jest.fn()}
        onNewInterview={onNewInterview}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /practise a new interview/i }))
    expect(onNewInterview).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <InterviewReportModal
        open={false}
        report={REPORT}
        onClose={jest.fn()}
        onNewInterview={jest.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
