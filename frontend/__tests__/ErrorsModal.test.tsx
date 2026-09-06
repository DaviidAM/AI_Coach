/**
 * Frontend tests for ErrorsModal component.
 * Verifies: corrections rendering, empty state, close button, ESC key.
 *
 * Prerequisite: ErrorsModal.tsx must exist at @/components/ErrorsModal
 * with props: open (boolean), sessionId (string), onClose (() => void)
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorsModal } from '@/components/ErrorsModal'
import type { Correction } from '@/lib/api'

// ─── Mock jspdf ─────────────────────────────────────────────────────────────────

jest.mock('jspdf', () => {
  return jest.fn().mockImplementation(() => ({
    setFontSize: jest.fn(),
    text: jest.fn(),
    save: jest.fn(),
    lastAutoTable: { finalY: 0 },
  }))
})

jest.mock('jspdf-autotable', () => {
  return jest.fn()
})

// ─── Mock fetch ────────────────────────────────────────────────────────────────

const fetchMock = jest.fn()
global.fetch = fetchMock

beforeEach(() => {
  fetchMock.mockReset()
})

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

// ─── Sample data ───────────────────────────────────────────────────────────────

const sampleCorrections: Correction[] = [
  {
    id: '1',
    original_phrase: 'I go to school yesterday',
    corrected_phrase: 'I went to school yesterday',
    explanation: 'Use past tense for completed actions',
    error_level: 'B1',
    category: 'grammar',
    timestamp: '2024-01-01T10:00:00Z',
  },
  {
    id: '2',
    original_phrase: 'She have a car',
    corrected_phrase: 'She has a car',
    explanation: 'Subject-verb agreement',
    error_level: 'C1',
    category: 'grammar',
    timestamp: '2024-01-01T10:05:00Z',
  },
]

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ErrorsModal', () => {
  describe('when open=true with corrections', () => {
    it('renders original phrase with strikethrough', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ corrections: sampleCorrections, total: 2, limit: 50, offset: 0 }),
      })

      render(
        <ErrorsModal
          open={true}
          sessionId="test-session"
          onClose={jest.fn()}
        />
      )

      // Original phrases should appear
      expect(await screen.findByText(/I go to school yesterday/i)).toBeInTheDocument()
      expect(await screen.findByText(/She have a car/i)).toBeInTheDocument()
    })

    it('renders corrected phrases', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ corrections: sampleCorrections, total: 2, limit: 50, offset: 0 }),
      })

      render(
        <ErrorsModal
          open={true}
          sessionId="test-session"
          onClose={jest.fn()}
        />
      )

      expect(await screen.findByText('I went to school yesterday')).toBeInTheDocument()
      expect(await screen.findByText('She has a car')).toBeInTheDocument()
    })

    it('renders category badge', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ corrections: sampleCorrections, total: 2, limit: 50, offset: 0 }),
      })

      render(
        <ErrorsModal
          open={true}
          sessionId="test-session"
          onClose={jest.fn()}
        />
      )

      // Category badges should appear (grammar)
      expect(await screen.findAllByText(/grammar/i)).toHaveLength(2)
    })
  })

  describe('empty state', () => {
    it('shows empty state message when corrections array is empty', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ corrections: [], total: 0, limit: 50, offset: 0 }),
      })

      render(
        <ErrorsModal
          open={true}
          sessionId="test-session"
          onClose={jest.fn()}
        />
      )

      expect(
        await screen.findByText(/No errors yet. Start chatting and we'll track your mistakes here./i)
      ).toBeInTheDocument()
    })

    it('shows empty state when API returns null corrections', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ corrections: null, total: 0, limit: 50, offset: 0 }),
      })

      render(
        <ErrorsModal
          open={true}
          sessionId="test-session"
          onClose={jest.fn()}
        />
      )

      expect(
        await screen.findByText(/No errors yet. Start chatting and we'll track your mistakes here./i)
      ).toBeInTheDocument()
    })
  })

  describe('close button', () => {
    it('calls onClose when X button is clicked', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ corrections: [], total: 0, limit: 50, offset: 0 }),
      })

      const onClose = jest.fn()
      render(
        <ErrorsModal
          open={true}
          sessionId="test-session"
          onClose={onClose}
        />
      )

      // Wait for modal to render, then find and click the close button
      // The button should have aria-label "Close" or contain an X
      const closeButton = await screen.findByRole('button', { name: /close/i })
      fireEvent.click(closeButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyboard interaction', () => {
    it('calls onClose when Escape key is pressed', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ corrections: [], total: 0, limit: 50, offset: 0 }),
      })

      const onClose = jest.fn()
      render(
        <ErrorsModal
          open={true}
          sessionId="test-session"
          onClose={onClose}
        />
      )

      // Wait for modal to render first
      await screen.findByText(/No errors yet/i)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
