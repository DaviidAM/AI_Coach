'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { InterviewType } from '@/types/interview'
import type { Theme } from '@/types'
import { CoachIcon } from './icons/CoachIcon'
import styles from './InterviewTopbar.module.css'

const THEME_KEY = 'ai-coach-theme'

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem(THEME_KEY) as Theme) || 'dark'
}

interface InterviewTopbarProps {
  roleTitle?: string | null
  company?: string | null
  interviewType?: InterviewType | null
  feedbackCount?: number
  ending?: boolean
  onOpenFeedback: () => void
  onEndInterview: () => void
  onNewInterview: () => void
}

export function InterviewTopbar({
  roleTitle,
  company,
  interviewType,
  feedbackCount = 0,
  ending = false,
  onOpenFeedback,
  onEndInterview,
  onNewInterview,
}: InterviewTopbarProps) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = getStoredTheme()
    setTheme(stored)
    document.documentElement.setAttribute('data-theme', stored)
  }, [])

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem(THEME_KEY, next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <nav className={styles.topbar}>
      <div className={styles.left}>
        <span className={styles.logo} aria-hidden="true">
          <CoachIcon size={30} />
        </span>
        <div className={styles.brandBlock}>
          <Link href="/interview" className={styles.brand}>
            Interview AI Coach
          </Link>
          <span className={styles.role}>
            {roleTitle || 'Software interview practice'}
            {company ? ` · ${company}` : ''}
          </span>
        </div>
      </div>

      <div className={styles.center}>
        {interviewType && (
          <span className={`${styles.typeBadge} ${styles[interviewType]}`}>
            {interviewType === 'intro'
              ? 'Introduction'
              : interviewType === 'technical'
              ? 'Technical'
              : 'Final'}
          </span>
        )}
        <Link href="/" className={styles.switchLink}>
          English coach →
        </Link>
      </div>

      <div className={styles.right}>
        <button
          type="button"
          className={styles.feedbackBtn}
          onClick={onOpenFeedback}
          aria-label="View all interview feedback"
        >
          <span className={styles.feedbackLabel}>All feedback</span>
          {feedbackCount > 0 && (
            <span className={styles.badge}>{feedbackCount}</span>
          )}
        </button>

        <button
          type="button"
          className={styles.endBtn}
          onClick={onEndInterview}
          disabled={ending}
          aria-label="End interview and view report"
        >
          {ending ? 'Analysing…' : 'End interview'}
        </button>

        <button
          type="button"
          className={styles.iconBtn}
          onClick={onNewInterview}
          aria-label="Start a new interview"
          title="New interview"
        >
          ＋
        </button>

        <button
          type="button"
          className={styles.iconBtn}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  )
}
