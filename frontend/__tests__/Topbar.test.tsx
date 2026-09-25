/* eslint-disable */
import {render, screen, fireEvent} from '@testing-library/react'
import {Topbar} from '@/components/Topbar'

jest.mock('@/lib/api', () => ({
  getLevel: jest.fn().mockResolvedValue('A2'),
  setLevel: jest.fn().mockResolvedValue(undefined),
}))

const localStorageMock = {
  getItem: jest.fn().mockReturnValue('dark'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}
Object.defineProperty(window, 'localStorage', {value: localStorageMock})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

describe('Topbar', () => {
  it('renders brand text', () => {
    render(<Topbar />)
    expect(screen.getByText('English AI Coach')).toBeInTheDocument()
  })

  it('renders demo version label', () => {
    render(<Topbar />)
    expect(screen.getByText('Demo Version')).toBeInTheDocument()
  })

  it('renders all level chips when menu is open', () => {
    render(<Topbar />)
    // Click the level selector button to open the dropdown menu
    const selectorBtn = screen.getByRole('button', {name: /english level/i})
    fireEvent.click(selectorBtn)
    // Find the level menu (role=listbox) and check items within it
    const menu = screen.getByRole('listbox')
    const chips = [
      { key: 'A1', label: 'A1 Beginner' },
      { key: 'A2', label: 'A2 Elementary' },
      { key: 'B1', label: 'B1 Intermediate' },
      { key: 'B2', label: 'B2 Upper-Int.' },
      { key: 'C1', label: 'C1 Advanced' },
      { key: 'C2', label: 'C2 Proficient' },
    ]
    chips.forEach(function(item) {
      expect(screen.getByRole('option', {name: item.label})).toBeInTheDocument()
    })
  })

  it('renders theme toggle button', () => {
    render(<Topbar />)
    const toggle = screen.getByRole('button', {name: /switch to/i})
    expect(toggle).toBeInTheDocument()
  })
})
