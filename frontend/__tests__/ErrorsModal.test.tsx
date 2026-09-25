/**
 * Frontend tests for ErrorsModal component.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ErrorsModal } from '@/components/ErrorsModal'
import type { Correction } from '@/lib/api'

// ─── Mock jspdf ─────────────────────────────────────────────────────────────────

jest.mock('jspdf', () =>
  jest.fn().mockImplementation(() => ({
    setFontSize: jest.fn(),
    text: jest.fn(),
    save: jest.fn(),
    lastAutoTable: { finalY: 0 },
  })),
)

jest.mock('jspdf-autotable', () => jest.fn())

// ─── Mock matchMedia ─────────────────────────────────────────────────────────────

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

// ─── Mock getCorrections directly ───────────────────────────────────────────────

const sampleCorrections: Correction[] = [
  {
    id: '1',
    original_phrase: 'I go to school yesterday',
    corrected_phrase: 'I went to school yesterday',
    explanation: 'Use past tense',
    error_level: 'B1',
    category: 'grammar',
    timestamp: '2024-01-01T10:00:00Z',
  },
]

jest.mock('@/lib/api', () => ({
  getCorrections: jest.fn().mockResolvedValue([]),
  getLevel: jest.fn(),
  setLevel: jest.fn(),
  getSettings: jest.fn(),
  audioUrl: jest.fn(),
  sendText: jest.fn(),
  sendAudio: jest.fn(),
  resetConversation: jest.fn(),
  updateSettings: jest.fn(),
  switchLocale: jest.fn(),
  generateSessionId: jest.fn(),
  fetchBackend: jest.fn(),
  getConfig: jest.fn(),
  submitCorrection: jest.fn(),
}))

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ErrorsModal', () => {
  beforeEach(() => {
    const { getCorrections } = require('@/lib/api')
    ;(getCorrections as jest.Mock).mockResolvedValue([])
  })

  it('renders modal with correct aria-label', async () => {
    render(
      <ErrorsModal open={true} sessionId="test-session" onClose={jest.fn()} />,
    )
    await screen.findByRole('dialog', { name: /corrections/i })
  })

  it('calls onClose when X button is clicked', async () => {
    const onClose = jest.fn()
    render(
      <ErrorsModal open={true} sessionId="test-session" onClose={onClose} />,
    )
    const btn = await screen.findByRole('button', { name: /close/i })
    fireEvent.click(btn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders correction rows when data is available', async () => {
    const { getCorrections } = require('@/lib/api')
    ;(getCorrections as jest.Mock).mockResolvedValue(sampleCorrections)

    render(
      <ErrorsModal open={true} sessionId="test-session" onClose={jest.fn()} />,
    )
    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog.textContent).toContain('I go to school yesterday')
    })
  })
})
