import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { InterviewSetupModal } from '@/components/InterviewSetupModal'
import type { InterviewSkillInfo } from '@/types/interview'

const SKILLS: InterviewSkillInfo[] = [
  { id: 'intro', title: 'Introduction', description: 'Recruiter screen.', focus: 'Fit' },
  { id: 'technical', title: 'Technical', description: 'Deep technical round.', focus: 'Depth' },
  { id: 'final', title: 'Final', description: 'Hiring manager round.', focus: 'Behaviour' },
]

function renderModal(overrides: Partial<ComponentProps<typeof InterviewSetupModal>> = {}) {
  const onSubmit = jest.fn()
  render(
    <InterviewSetupModal
      open
      skills={SKILLS}
      canClose={false}
      busy={false}
      error={null}
      onClose={jest.fn()}
      onSubmit={onSubmit}
      {...overrides}
    />
  )
  return { onSubmit }
}

describe('InterviewSetupModal', () => {
  it('renders the offer input and the three interview stages', () => {
    renderModal()
    expect(screen.getByText('Set up your interview')).toBeInTheDocument()
    expect(screen.getByLabelText('Job offer text')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /introduction/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /technical/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /final/i })).toBeInTheDocument()
  })

  it('submits pasted text with the selected stage', async () => {
    const { onSubmit } = renderModal()
    fireEvent.change(screen.getByLabelText('Job offer text'), {
      target: { value: 'Senior Backend Engineer at Acme. Python and AWS.' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /technical/i }))
    fireEvent.click(screen.getByRole('button', { name: /start interview/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        interviewType: 'technical',
        jobText: 'Senior Backend Engineer at Acme. Python and AWS.',
        jobFile: undefined,
      })
    })
  })

  it('blocks submission when the offer is empty', () => {
    const { onSubmit } = renderModal()
    const start = screen.getByRole('button', { name: /start interview/i })
    expect(start).toBeDisabled()
    fireEvent.click(start)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits an uploaded file', async () => {
    const { onSubmit } = renderModal()
    fireEvent.click(screen.getByRole('tab', { name: /upload file/i }))
    const file = new File(['Senior Engineer'], 'offer.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText('Job offer file'), {
      target: { files: [file] },
    })
    fireEvent.click(screen.getByRole('button', { name: /start interview/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        interviewType: 'intro',
        jobText: undefined,
        jobFile: file,
      })
    })
  })

  it('rejects unsupported file types', () => {
    renderModal()
    fireEvent.click(screen.getByRole('tab', { name: /upload file/i }))
    const file = new File(['oops'], 'offer.exe', { type: 'application/octet-stream' })
    fireEvent.change(screen.getByLabelText('Job offer file'), {
      target: { files: [file] },
    })
    expect(
      screen.getByText(/upload a \.txt, \.md, \.pdf or \.docx file/i)
    ).toBeInTheDocument()
  })

  it('only shows the close button when closing is allowed', () => {
    const { rerender } = render(
      <InterviewSetupModal
        open
        skills={SKILLS}
        canClose={false}
        busy={false}
        error={null}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />
    )
    expect(screen.queryByLabelText('Close setup')).not.toBeInTheDocument()
    rerender(
      <InterviewSetupModal
        open
        skills={SKILLS}
        canClose
        busy={false}
        error={null}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />
    )
    expect(screen.getByLabelText('Close setup')).toBeInTheDocument()
  })
})
