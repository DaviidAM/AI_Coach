import { render, screen } from '@testing-library/react'
import { InterviewTopbar } from '@/components/InterviewTopbar'

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: jest.fn() }),
}))

const props = {
  roleTitle: 'Senior Backend Engineer',
  company: 'Acme',
  interviewType: 'technical' as const,
  feedbackCount: 2,
  onOpenFeedback: jest.fn(),
  onEndInterview: jest.fn(),
  onNewInterview: jest.fn(),
}

describe('InterviewTopbar', () => {
  it('shows only the AI Coach Home back link instead of the old coach switcher', () => {
    render(<InterviewTopbar {...props} />)

    const home = screen.getByRole('link', { name: 'AI Coach Home' })
    expect(home).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: 'English coach' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'All coaches' })).not.toBeInTheDocument()
  })
})
