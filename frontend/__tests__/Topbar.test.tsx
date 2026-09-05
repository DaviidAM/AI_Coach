import { render, screen } from '@testing-library/react'
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

describe('Topbar', () => {
  it('renders logo and brand text', () => {
    render(<Topbar />)
    expect(screen.getByText('AI Coach')).toBeInTheDocument()
    expect(screen.getByText('🎯')).toBeInTheDocument()
  })

  it('renders language label', () => {
    render(<Topbar />)
    expect(screen.getByText('English · voice & text')).toBeInTheDocument()
  })

  it('renders all level chips', () => {
    render(<Topbar />)
    const chips = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
    chips.forEach((level) => {
      expect(screen.getByRole('button', { name: new RegExp(level) })).toBeInTheDocument()
    })
  })

  it('renders theme toggle button', () => {
    render(<Topbar />)
    const toggle = screen.getByRole('button', { name: /switch to/i })
    expect(toggle).toBeInTheDocument()
  })
})
