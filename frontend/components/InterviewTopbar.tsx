'use client'

import Link from 'next/link'
import type { InterviewType } from '@/types/interview'
import { useTheme } from '@/hooks/useTheme'
import { CoachHeader } from './chat/CoachHeader'
import headerStyles from './chat/HeaderControls.module.css'
import { BriefcaseIcon } from './icons/AppIcons'
import styles from './InterviewTopbar.module.css'

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

const TYPE_LABELS: Record<InterviewType, string> = {
  intro: 'Introduction',
  technical: 'Technical',
  final: 'Final',
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
  const { theme, toggleTheme } = useTheme()

  return (
    <CoachHeader
      titleLead="Interview"
      titleAccent="Coach"
      subtitle="Practice today. Create tomorrow."
      headerBack={
        <Link href="/" className={headerStyles.backLink}>
          <span className={headerStyles.backArrow} aria-hidden="true">
            ←
          </span>
          <span>AI Coach Home</span>
        </Link>
      }
      headerActions={
        <button
          type="button"
          className={headerStyles.themeToggle}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      }
      sessionIcon={<BriefcaseIcon size={24} />}
      sessionTitle={roleTitle || 'Software interview practice'}
      sessionMeta={
        <>
          {interviewType && (
            <span className={`${styles.typeBadge} ${styles[interviewType]}`}>
              {TYPE_LABELS[interviewType]}
            </span>
          )}
          <span>{company ? `${company} · Mock interview` : 'Mock interview'}</span>
          {feedbackCount > 0 && (
            <>
              <span className={headerStyles.metaDot} aria-hidden="true">
                •
              </span>
              <span>
                {feedbackCount} coaching {feedbackCount === 1 ? 'note' : 'notes'}
              </span>
            </>
          )}
        </>
      }
      sessionActions={
        <>
          <button
            type="button"
            className={headerStyles.pill}
            onClick={onOpenFeedback}
            aria-label="View all interview feedback"
          >
            <span>All feedback</span>
            {feedbackCount > 0 && (
              <span className={headerStyles.badge}>{feedbackCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`${headerStyles.pill} ${headerStyles.pillAccent}`}
            onClick={onEndInterview}
            disabled={ending}
            aria-label="End interview and view report"
          >
            {ending ? 'Analysing…' : 'End interview'}
          </button>

          <button
            type="button"
            className={headerStyles.iconButton}
            onClick={onNewInterview}
            aria-label="Start a new interview"
            title="New interview"
          >
            ＋
          </button>
        </>
      }
    />
  )
}
