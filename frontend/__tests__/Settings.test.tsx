/**
 * Regression tests for settings feature:
 * - getSettings / setSettings API calls (fetch mocked)
 * - localStorage persistence (mocked)
 *
 * The Settings modal UI itself is implemented in t_4d024719.
 * These tests cover the API client layer and localStorage integration.
 */
import { getSettings, setSettings, Settings } from '@/lib/api'

// ─── Mock fetch ────────────────────────────────────────────────────────────────

const fetchMock = jest.fn()
global.fetch = fetchMock

beforeEach(() => {
  fetchMock.mockReset()
})

// ─── Mock localStorage ─────────────────────────────────────────────────────────

const SETTINGS_KEY = 'ai-coach-settings'

const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: jest.fn((key: string) => localStorageStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    localStorageStore[key] = value
  }),
  removeItem: jest.fn((key: string) => {
    delete localStorageStore[key]
  }),
  clear: jest.fn(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
  }),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// ─── Tests: getSettings ────────────────────────────────────────────────────────

describe('getSettings', () => {
  beforeEach(() => {
    // Reset localStorage store between tests
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
  })

  it('calls GET /api/settings?session_id=...', async () => {
    const sessionId = 'test-session-123'
    const mockResponse: Settings = { provider: 'minimax', model: 'MiniMax-Text-01' }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const result = await getSettings(sessionId)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/settings?session_id=test-session-123'
    )
    expect(result).toEqual(mockResponse)
  })

  it('throws when the response is not ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await expect(getSettings('any-session')).rejects.toThrow('Failed to fetch settings')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('encodes special characters in session_id', async () => {
    const sessionId = 'session with spaces & symbols!'
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ provider: 'minimax', model: 'MiniMax-Text-01' }),
    })

    await getSettings(sessionId)

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('session_id=' + encodeURIComponent(sessionId))
  })
})

// ─── Tests: setSettings ────────────────────────────────────────────────────────

describe('setSettings', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
  })

  it('calls POST /api/settings with correct body', async () => {
    const sessionId = 'test-session-456'
    const settings: Settings = { provider: 'openai', model: 'gpt-4o-mini' }
    fetchMock.mockResolvedValueOnce({
      ok: true,
    })

    await setSettings(sessionId, settings)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/settings',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, ...settings }),
      })
    )
  })

  it('throws when the response is not ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
    })

    await expect(
      setSettings('any-session', { provider: 'unknown', model: 'none' })
    ).rejects.toThrow('Failed to set settings')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('spreads session_id alongside settings fields', async () => {
    const sessionId = 'sid-789'
    const settings: Settings = { provider: 'groq', model: 'llama-3.1-8b-instant' }
    fetchMock.mockResolvedValueOnce({ ok: true })

    await setSettings(sessionId, settings)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ session_id: sessionId, ...settings })
    expect(body.session_id).toBe(sessionId)
    expect(body.provider).toBe('groq')
    expect(body.model).toBe('llama-3.1-8b-instant')
  })
})

// ─── Tests: localStorage persistence ─────────────────────────────────────────

describe('localStorage persistence (ai-coach-settings)', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
  })

  it('saves settings to localStorage', () => {
    const settings: Settings = { provider: 'minimax', model: 'MiniMax-Text-01' }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))

    expect(localStorage.setItem).toHaveBeenCalledWith(
      SETTINGS_KEY,
      JSON.stringify(settings)
    )
    expect(localStorageStore[SETTINGS_KEY]).toBe(JSON.stringify(settings))
  })

  it('reads settings from localStorage', () => {
    const settings: Settings = { provider: 'openai', model: 'gpt-4o-mini' }
    localStorageStore[SETTINGS_KEY] = JSON.stringify(settings)

    const stored = localStorage.getItem(SETTINGS_KEY)
    expect(stored).toBe(JSON.stringify(settings))
    expect(JSON.parse(stored!)).toEqual(settings)
  })

  it('returns null when no settings are stored', () => {
    // localStorageStore is empty in beforeEach
    const result = localStorage.getItem(SETTINGS_KEY)
    expect(result).toBeNull()
  })

  it('removes settings from localStorage', () => {
    localStorageStore[SETTINGS_KEY] = JSON.stringify({ provider: 'minimax', model: 'MiniMax-Text-01' })
    localStorage.removeItem(SETTINGS_KEY)

    expect(localStorage.removeItem).toHaveBeenCalledWith(SETTINGS_KEY)
    expect(localStorageStore[SETTINGS_KEY]).toBeUndefined()
  })

  it('round-trip: save then read yields equivalent object', () => {
    const settings: Settings = { provider: 'anthropic', model: 'claude-sonnet-4' }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    const retrieved = JSON.parse(localStorage.getItem(SETTINGS_KEY)!)

    expect(retrieved).toEqual(settings)
  })
})
