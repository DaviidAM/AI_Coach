'use client'

import {useTranslations} from 'next-intl'
import {useEffect, useState} from 'react'
import Link from 'next/link'
import type {Correction} from '@/lib/api'
import styles from './corrections.module.css'

const DEVICE_KEY = 'ai-coach-device-id'

function getStoredDeviceId(): string {
  if (typeof window === 'undefined') return 'anonymous'
  let did = localStorage.getItem(DEVICE_KEY)
  if (!did) {
    did = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, did)
  }
  return did
}

interface RecentCorrection {
  id: number
  user_id: string
  session_id: string
  original_phrase: string
  corrected_phrase: string
  explanation: string
  error_level: string
  category?: string
  user_text_snippet: string
  reviewed_at: string | null
  created_at: string
}

export default function CorrectionsPage() {
  const t = useTranslations()
  const [corrections, setCorrections] = useState<RecentCorrection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<number | null>(null)

  useEffect(() => {
    const deviceId = getStoredDeviceId()
    fetch(`/api/corrections/recent?user_id=${encodeURIComponent(deviceId)}&limit=50`, {
      headers: {'X-User-Device-Id': deviceId},
    })
      .then((r) => r.json())
      .then((data) => {
        setCorrections(data.corrections ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load corrections.')
        setLoading(false)
      })
  }, [])

  async function markReviewed(correctionId: number) {
    setReviewing(correctionId)
    const deviceId = getStoredDeviceId()
    try {
      const res = await fetch(`/api/corrections/${correctionId}/review`, {
        method: 'POST',
        headers: {'X-User-Device-Id': deviceId},
      })
      if (res.ok) {
        setCorrections((prev) =>
          prev.map((c) =>
            c.id === correctionId
              ? {...c, reviewed_at: new Date().toISOString()}
              : c,
          ),
        )
      }
    } finally {
      setReviewing(null)
    }
  }

  const unreviewed = corrections.filter((c) => !c.reviewed_at)
  const reviewed = corrections.filter((c) => c.reviewed_at)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/" className={styles.backLink}>
          ← Back to chat
        </Link>
        <h1 className={styles.title}>{t('correctionQueue')}</h1>
        <p className={styles.subtitle}>
          {unreviewed.length > 0
            ? `${unreviewed.length} unreviewed correction${unreviewed.length !== 1 ? 's' : ''}`
            : 'All caught up!'}
        </p>
      </div>

      <div className={styles.content}>
        {loading && <p className={styles.empty}>{t('audioTranscribing')}</p>}
        {error && <p className={styles.empty}>{error}</p>}
        {!loading && !error && corrections.length === 0 && (
          <div className={styles.emptyState}>
            <p>{t('noCorrectionsQueue')}</p>
          </div>
        )}

        {unreviewed.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>To Review</h2>
            <div className={styles.list}>
              {unreviewed.map((c) => (
                <div key={c.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.badge}>{c.error_level}</span>
                    <span className={styles.badgeCategory}>{c.category}</span>
                    <span className={styles.date}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={styles.phrases}>
                    <span className={styles.original}>{c.original_phrase}</span>
                    <span className={styles.arrow}>→</span>
                    <span className={styles.corrected}>{c.corrected_phrase}</span>
                  </div>
                  <p className={styles.explanation}>{c.explanation}</p>
                  <button
                    className={styles.reviewBtn}
                    onClick={() => markReviewed(c.id)}
                    disabled={reviewing === c.id}
                  >
                    {reviewing === c.id ? '…' : t('markReviewed')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {reviewed.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('reviewed')}</h2>
            <div className={styles.list}>
              {reviewed.map((c) => (
                <div key={c.id} className={`${styles.card} ${styles.cardReviewed}`}>
                  <div className={styles.cardTop}>
                    <span className={styles.badge}>{c.error_level}</span>
                    <span className={styles.badgeCategory}>{c.category}</span>
                    <span className={styles.date}>
                      Reviewed {new Date(c.reviewed_at!).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={styles.phrases}>
                    <span className={styles.original}>{c.original_phrase}</span>
                    <span className={styles.arrow}>→</span>
                    <span className={styles.corrected}>{c.corrected_phrase}</span>
                  </div>
                  <p className={styles.explanation}>{c.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
