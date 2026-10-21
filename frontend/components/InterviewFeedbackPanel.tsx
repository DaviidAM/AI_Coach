'use client'

import type { InterviewFeedback } from '@/types/interview'
import styles from './InterviewFeedbackPanel.module.css'

interface InterviewFeedbackPanelProps {
  feedback: InterviewFeedback[]
  strengths: string[]
  answerScore: number | null
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

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  major: 'Improve',
  minor: 'Polish',
}

export function InterviewFeedbackPanel({
  feedback,
  strengths,
  answerScore,
}: InterviewFeedbackPanelProps) {
  return (
    <div className={styles.panel} aria-live="polite">
      <div className={styles.header}>
        <div className={styles.title}>
          <span aria-hidden="true">🎯</span> Answer review
        </div>
        {answerScore !== null && (
          <div
            className={styles.score}
            aria-label={`Answer score ${answerScore} out of 5`}
          >
            <span className={styles.scoreValue}>{answerScore}</span>
            <span className={styles.scoreMax}>/5</span>
          </div>
        )}
      </div>

      {strengths.length > 0 && (
        <div className={styles.strengths}>
          <span className={styles.strengthsLabel}>What worked</span>
          <ul className={styles.strengthList}>
            {strengths.map((strength, index) => (
              <li key={`${strength}-${index}`}>{strength}</li>
            ))}
          </ul>
        </div>
      )}

      {feedback.length === 0 ? (
        <div className={styles.empty}>
          No major mistakes in this answer. Keep the same structure and add one
          concrete result if you can.
        </div>
      ) : (
        <div className={styles.cards}>
          {feedback.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span
                  className={`${styles.severity} ${styles[item.severity] ?? ''}`}
                >
                  {SEVERITY_LABELS[item.severity] ?? item.severity}
                </span>
                <span className={styles.category}>
                  {CATEGORY_LABELS[item.category] ?? item.category}
                </span>
              </div>

              {item.question && (
                <div className={styles.question}>
                  <span className={styles.fieldLabel}>Question</span>
                  {item.question}
                </div>
              )}

              {item.evidence && (
                <blockquote className={styles.evidence}>
                  “{item.evidence}”
                </blockquote>
              )}

              <div className={styles.block}>
                <span className={styles.fieldLabel}>What went wrong</span>
                <p>{item.issue}</p>
              </div>

              <div className={styles.block}>
                <span className={styles.fieldLabel}>Why it matters</span>
                <p>{item.why_it_matters}</p>
              </div>

              <div className={`${styles.block} ${styles.better}`}>
                <span className={styles.fieldLabel}>Stronger answer</span>
                <p>{item.better_answer}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
