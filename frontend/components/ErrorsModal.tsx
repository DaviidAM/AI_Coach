'use client'

import { useEffect, useCallback, useState } from 'react'
import { getCorrections } from '@/lib/api'
import type { Correction } from '@/lib/api'
import styles from './ErrorsModal.module.css'

interface ErrorsModalProps {
  open: boolean
  sessionId: string
  onClose: () => void
}

export function ErrorsModal({ open, sessionId, onClose }: ErrorsModalProps) {
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !sessionId) return

    let cancelled = false
    setLoading(true)
    setError(null)

    getCorrections(sessionId)
      .then((data) => {
        if (!cancelled) setCorrections(data ?? [])
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load errors.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, sessionId])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Error history">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Error History</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {loading && <p className={styles.empty}>Loading…</p>}
          {error && <p className={styles.empty}>{error}</p>}
          {!loading && !error && corrections.length === 0 && (
            <p className={styles.empty}>
              No errors yet. Start chatting and we&apos;ll track your mistakes here.
            </p>
          )}
          {!loading && !error && corrections.length > 0 && (
            <ul className={styles.list}>
              {corrections.map((c) => (
                <li key={c.id ?? `${c.original_phrase}-${c.timestamp}`} className={styles.card}>
                  <div className={styles.cardRow}>
                    <span className={styles.original}>{c.original_phrase}</span>
                    <span className={styles.arrow}>→</span>
                    <span className={styles.corrected}>{c.corrected_phrase}</span>
                    {c.category && (
                      <span className={styles.badge}>{c.category}</span>
                    )}
                  </div>
                  {c.explanation && (
                    <p className={styles.explanation}>{c.explanation}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
