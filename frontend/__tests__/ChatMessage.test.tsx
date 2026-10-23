import { render, screen } from '@testing-library/react'
import { ChatMessage } from '@/components/chat'

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: jest.fn(),
  })
})

describe('ChatMessage', () => {
  it('renders text, timestamp, speaker label and audio', () => {
    render(
      <ChatMessage
        role="coach"
        text="Tell me about a recent project."
        speakerLabel="Interviewer · Staff Engineer"
        audioSrc="/api/interview/audio/1"
        audioLabel="Interviewer"
        timestamp={new Date('2026-01-01T10:15:00Z').getTime()}
      />
    )

    expect(screen.getByText('Tell me about a recent project.')).toBeInTheDocument()
    expect(screen.getByText('Interviewer · Staff Engineer')).toBeInTheDocument()
    expect(screen.getByLabelText('Play interviewer audio')).toBeInTheDocument()
    expect(screen.getByText(/\d{2}:\d{2}/)).toBeInTheDocument()
  })

  it('shows the shared pending state with a coach-specific label', () => {
    render(
      <ChatMessage
        role="coach"
        pending
        pendingLabel="Interviewer is thinking…"
      />
    )

    expect(screen.getByText('Interviewer is thinking…')).toBeInTheDocument()
    expect(screen.queryByTestId('audio-play')).not.toBeInTheDocument()
  })

  it('does not render an audio player while a turn is pending', () => {
    render(
      <ChatMessage
        role="user"
        text="🎤 (transcribing...)"
        audioSrc="/api/audio/pending"
        pending
      />
    )

    expect(screen.getByText('🎤 (transcribing...)')).toBeInTheDocument()
    expect(screen.queryByTestId('audio-play')).not.toBeInTheDocument()
  })
})
