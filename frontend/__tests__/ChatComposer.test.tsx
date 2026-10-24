import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ChatComposer } from '@/components/chat'

function renderComposer(overrides: Partial<ComponentProps<typeof ChatComposer>> = {}) {
  const onSend = jest.fn()
  const onChange = jest.fn()
  const onStartRecording = jest.fn()
  const onStopRecording = jest.fn()

  render(
    <ChatComposer
      value=""
      onChange={onChange}
      onSend={onSend}
      placeholder="Type your answer"
      inputLabel="Your answer"
      sendAriaLabel="Send answer"
      recordAriaLabel="Hold to record your answer"
      recordingAriaLabel="Recording — release to send"
      onStartRecording={onStartRecording}
      onStopRecording={onStopRecording}
      {...overrides}
    />
  )

  return { onSend, onChange, onStartRecording, onStopRecording }
}

describe('ChatComposer', () => {
  it('sends on Enter and button click', () => {
    const { onSend } = renderComposer({ value: 'A short answer' })
    const input = screen.getByLabelText('Your answer')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    expect(onSend).toHaveBeenCalledTimes(2)
  })

  it('keeps Shift+Enter for a new line', () => {
    const { onSend } = renderComposer({ value: 'A short answer' })
    fireEvent.keyDown(screen.getByLabelText('Your answer'), {
      key: 'Enter',
      shiftKey: true,
    })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send while audio is recording', () => {
    const { onSend } = renderComposer({ value: 'A short answer', recording: true })
    fireEvent.keyDown(screen.getByLabelText('Your answer'), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('starts and stops hold-to-record audio', () => {
    const { onStartRecording, onStopRecording } = renderComposer()

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Hold to record your answer' })
    )
    expect(onStartRecording).toHaveBeenCalledTimes(1)

    fireEvent.mouseUp(
      screen.getByRole('button', { name: 'Hold to record your answer' })
    )
    expect(onStopRecording).toHaveBeenCalledTimes(1)
  })

  it('shows the limit state and coach actions', () => {
    const onAction = jest.fn()
    renderComposer({
      value: 'Blocked answer',
      atLimit: true,
      limitPlaceholder: 'Practice limit reached',
      limitMessage: 'Start a new interview to continue.',
      actions: [
        { key: 'new', label: 'Start a new interview', onClick: onAction },
      ],
    })

    expect(screen.getByLabelText('Your answer')).toBeDisabled()
    expect(screen.getByPlaceholderText('Practice limit reached')).toBeInTheDocument()
    expect(screen.getByText('Start a new interview to continue.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start a new interview' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
