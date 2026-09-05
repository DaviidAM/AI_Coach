import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Coach',
  description: 'AI-powered English learning coach',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
