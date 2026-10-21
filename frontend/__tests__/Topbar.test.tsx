import { fireEvent, render, screen } from '@testing-library/react'
import { Topbar } from '@/components/Topbar'

// Mock the API module
jest.mock('@/lib/api', () => ({
  getLevel: jest.fn().mockResolvedValue('A2'),
  setLevel: jest.fn().mockResolvedValue(undefined),
}))

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn().mockReturnValue('dark'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

beforeAll(() => {
  Object.defineProperty(global, 'crypto', {
    value: { randomUUID: () => 'test-session' },
    configurable: true,
  })
})

describe('Topbar', () => {
  it('renders the brand and demo label', () => {
    render(<Topbar />)
    expect(screen.getByText('English AI Coach')).toBeInTheDocument()
    expect(screen.getByText('Demo Version')).toBeInTheDocument()
  })

  it('links to the interview coach', () => {
    render(<Topbar />)
    const link = screen.getByRole('link', { name: 'Interview Coach' })
    expect(link).toHaveAttribute('href', '/interview')
  })

  it('opens the CEFR level menu and lists every level', () => {
    render(<Topbar />)
    fireEvent.click(screen.getByRole('button', { name: /English Level: A2/i }))
    const listbox = screen.getByRole('listbox', { name: 'English level' })
    expect(listbox).toBeInTheDocument()
    ;['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].forEach((level) => {
      expect(screen.getByRole('option', { name: new RegExp(level) })).toBeInTheDocument()
    })
  })

  it('renders theme toggle button', () => {
    render(<Topbar />)
    const toggle = screen.getByRole('button', { name: /switch to/i })
    expect(toggle).toBeInTheDocument()
  })

  it('shows the demo message counter when provided', () => {
    render(<Topbar messageCount={2} messageLimit={5} />)
    expect(screen.getByText('2 of 5 demo messages used')).toBeInTheDocument()
  })
})
