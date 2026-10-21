'use client'

import { useCallback, useEffect, useState } from 'react'
import { getInterviewFeedback } from '@/lib/interview-api'
import type { InterviewFeedback } from '@/types/interview'
import styles from './InterviewFeedbackModal.module.css'

interface InterviewFeedbackModalProps {
  open: boolean
  sessionId: string
  onClose: () => void
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  major: 'Improve',
  minor: 'Polish',
}

const CATEGORY_LABELS: Record<string, string> = {
  structure: 'Structure',
  relevance: 'Relevance',
  depth: 'Depth',
  technical_accuracy: 'Technical accuracy',
  communication: 'Communication',
  impact: 'Impact',
  leadership: 'Leadership',
  tradeoffs: 'Trade-offs',
  problem_solving: 'Problem solving',
  culture_fit: 'Culture fit',
  closing: 'Closing',
  other: 'Other',
}

function groupByTurn(feedback: InterviewFeedback[]): [number, InterviewFeedback[]][] {
  const groups = new Map<number, InterviewFeedback[]>()
  for (const item of feedback) {
    const turn = item.turn ?? 0
    if (!groups.has(turn)) groups.set(turn, [])
    groups.get(turn)!.push(item)
  }
  return Array.from(groups.entries()).sort((a, b) => b[0] - a[0])
}

export function InterviewFeedbackModal({
  open,
  sessionId,
  onClose,
}: InterviewFeedbackModalProps) {
  const [feedback, setFeedback] = useState<InterviewFeedback[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !sessionId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getInterviewFeedback(sessionId, 100, 0)
      .then((data) => {
        if (cancelled) return
        setFeedback(data.feedback ?? [])
        setTotal(data.total ?? 0)
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Failed to load feedback.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, sessionId])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const groups = groupByTurn(feedback)

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-feedback-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 id="interview-feedback-title" className={styles.title}>
              Interview feedback
            </h2>
            <p className={styles.subtitle}>
              {total > 0
                ? `${total} coaching ${total === 1 ? 'note' : 'notes'} across this interview.`
                : 'Your coaching notes will appear here after each answer.'}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close feedback"
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {loading && <p className={styles.empty}>Loading…</p>}
          {error && <p className={styles.empty}>{error}</p>}
          {!loading && !error && feedback.length === 0 && (
            <p className={styles.empty}>
              No feedback yet. Answer the interviewer&apos;s first question to get
              concrete advice.
            </p>
          )}

          {!loading &&
            !error &&
            groups.map(([turn, items]) => (
              <section key={turn} className={styles.turnGroup}>
                <h3 className={styles.turnTitle}>
                  Answer {turn}
                  <span className={styles.turnCount}>
                    {items.length} {items.length === 1 ? 'note' : 'notes'}
                  </span>
                </h3>
                {items.map((item) => (
                  <article key={item.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <span
                        className={`${styles.severity} ${
                          styles[item.severity] ?? ''
                        }`}
                      >
                        {SEVERITY_LABELS[item.severity] ?? item.severity}
                      </span>
                      <span className={styles.category}>
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                      <span className={styles.timestamp}>
                        {formatTime(item.timestamp)}
                      </span>
                    </div>
                    {item.question && (
                      <p className={styles.question}>{item.question}</p>
                    )}
                    {item.evidence && (
                      <blockquote className={styles.evidence}>
                        “{item.evidence}”
                      </blockquote>
                    )}
                    <div className={styles.block}>
                      <span className={styles.label}>What went wrong</span>
                      <p>{item.issue}</p>
                    </div>
                    <div className={styles.block}>
                      <span className={styles.label}>Why it matters</span>
                      <p>{item.why_it_matters}</p>
                    </div>
                    <div className={`${styles.block} ${styles.better}`}>
                      <span className={styles.label}>Stronger answer</span>
                      <p>{item.better_answer}</p>
                    </div>
                  </article>
                ))}
              </section>
            ))}
        </div>
      </div>
    </div>
  )
}

function formatTime(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
