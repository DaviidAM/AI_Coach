'use client'

import { useEffect } from 'react'
import type { InterviewReport } from '@/types/interview'
import styles from './InterviewReportModal.module.css'

interface InterviewReportModalProps {
  open: boolean
  report: InterviewReport | null
  onClose: () => void
  onNewInterview: () => void
}

const READINESS: Record<string, { label: string; className: string }> = {
  not_ready: { label: 'Not ready yet', className: 'notReady' },
  getting_there: { label: 'Getting there', className: 'gettingThere' },
  interview_ready: { label: 'Interview ready', className: 'ready' },
}

export function InterviewReportModal({
  open,
  report,
  onClose,
  onNewInterview,
}: InterviewReportModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !report) return null

  const readiness = READINESS[report.readiness] ?? {
    label: report.readiness,
    className: 'gettingThere',
  }
  const scorePercent = Math.max(0, Math.min(100, (report.overall_score / 5) * 100))

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-report-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 id="interview-report-title" className={styles.title}>
              Interview practice report
            </h2>
            <p className={styles.subtitle}>
              Based on {report.questions_answered}{' '}
              {report.questions_answered === 1 ? 'answer' : 'answers'}. This is
              practice feedback, not a hiring decision.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close report"
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.scoreBlock}>
            <div className={styles.scoreRow}>
              <div>
                <div className={styles.scoreLabel}>Overall score</div>
                <div className={styles.score}>
                  {report.overall_score.toFixed(1)}
                  <span className={styles.scoreMax}>/5</span>
                </div>
              </div>
              <span className={`${styles.readiness} ${styles[readiness.className]}`}>
                {readiness.label}
              </span>
            </div>
            <div className={styles.scoreTrack} aria-hidden="true">
              <div
                className={styles.scoreFill}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
          </div>

          <p className={styles.summary}>{report.summary}</p>

          <div className={styles.grid}>
            <ReportList
              title="Strengths"
              items={report.strengths}
              tone="positive"
            />
            <ReportList title="Gaps to close" items={report.gaps} tone="negative" />
          </div>

          <div className={styles.nextSteps}>
            <h3 className={styles.sectionTitle}>Next steps</h3>
            {report.next_steps.length === 0 ? (
              <p className={styles.muted}>No next steps were generated.</p>
            ) : (
              <ol className={styles.steps}>
                {report.next_steps.map((step, index) => (
                  <li key={`${step}-${index}`}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Keep reviewing
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onNewInterview}
          >
            Practise a new interview →
          </button>
        </div>
      </div>
    </div>
  )
}

function ReportList({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'positive' | 'negative'
}) {
  return (
    <section className={styles.listBlock}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {items.length === 0 ? (
        <p className={styles.muted}>Nothing recorded.</p>
      ) : (
        <ul className={`${styles.list} ${styles[tone]}`}>
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
