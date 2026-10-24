import { render, screen } from '@testing-library/react'
import LandingPage from '@/app/page'

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: jest.fn() }),
}))

describe('LandingPage', () => {
  it('renders the coach selection heading', () => {
    render(<LandingPage />)

    expect(
      screen.getByRole('heading', { name: /choose your coach/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/two coaches\. one practice space\./i)).toBeInTheDocument()
  })

  it('links each card to its coach interface', () => {
    render(<LandingPage />)

    const english = screen.getByRole('heading', { name: 'English Coach' })
    const interview = screen.getByRole('heading', { name: 'Interview Coach' })

    expect(english.closest('a')).toHaveAttribute('href', '/english')
    expect(interview.closest('a')).toHaveAttribute('href', '/interview')
  })

  it('renders the shared theme toggle', () => {
    render(<LandingPage />)

    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument()
  })
})
