import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Interview Coach | AI Coach',
  description:
    'Practise a tailored software, data, AI, architecture or technical-leadership interview with live feedback.',
}

export default function InterviewLayout({ children }: { children: ReactNode }) {
  return children
}
