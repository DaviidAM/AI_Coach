import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'English Coach | AI Coach',
  description:
    'Practise English conversation with CEFR-aware corrections and audio on every message.',
}

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return children
}
