'use client'

import { useEffect, useCallback, useState } from 'react'
import { getCorrections } from '@/lib/api'
import type { Correction } from '@/lib/api'
import styles from './ErrorsModal.module.css'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

interface ErrorsModalProps {
  open: boolean
  sessionId: string
  onClose: () => void
}

type SortBy = 'level' | 'recency'

const LEVEL_ORDER = ['C2', 'C1', 'B2', 'B1', 'A2', 'A1'] as const

function groupCorrections(
  corrections: Correction[],
  sortBy: SortBy
): Record<string, Correction[]> {
  if (sortBy === 'recency') {
    // Newest first — single group, no heading
    return { 'Recent': [...corrections].sort((a, b) => (+b.timestamp! || 0) - (+a.timestamp! || 0)) }
  }
  // Group by error_level, descending C2→A1
  const map: Record<string, Correction[]> = {}
  for (const lvl of LEVEL_ORDER) map[lvl] = []
  for (const c of corrections) {
    const lvl = (c.error_level ?? 'A1') as string
    if (map[lvl]) map[lvl].push(c)
    else map[lvl] = [c]
  }
  return map
}

function downloadPdf(corrections: Correction[], sortBy: SortBy) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('All Corrections — AI Coach (Demo)', 14, 18)
  doc.setFontSize(10)
  doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`, 14, 25)
  doc.text(`Total: ${corrections.length} corrections`, 14, 31)

  const grouped = groupCorrections(corrections, sortBy)
  let y = 40
  for (const [level, list] of Object.entries(grouped)) {
    if (list.length === 0) continue
    doc.setFontSize(12)
    doc.text(level, 14, y)
    autoTable(doc, {
      head: [['Original', 'Corrected', 'Why', 'Type']],
      body: list.map((c) => [
        c.original_phrase,
        c.corrected_phrase,
        c.explanation,
        c.category ?? '',
      ]),
      startY: y + 4,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [99, 102, 241] },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }
  doc.save(`ai-coach-corrections-${new Date().toISOString().split('T')[0]}.pdf`)
}

export function ErrorsModal({ open, sessionId, onClose }: ErrorsModalProps) {
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('level')

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

  const grouped = groupCorrections(corrections, sortBy)

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="All Corrections">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>All Corrections</h2>
          <div className={styles.headerRight}>
            <select
              className={styles.sortSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              aria-label="Sort corrections by"
            >
              <option value="level">By level (high → low)</option>
              <option value="recency">By recency (newest first)</option>
            </select>
            <button
              className={styles.pdfBtn}
              onClick={() => downloadPdf(corrections, sortBy)}
              disabled={corrections.length === 0}
              aria-label="Download corrections as PDF"
            >
              PDF
            </button>
            <button
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
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
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Original</th>
                  <th>Corrected</th>
                  <th>Why</th>
                  <th>Level</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([level, list]) => {
                  if (list.length === 0) return null
                  return (
                    <tr key={`group-${level}`}>
                      <td colSpan={5} className={styles.groupCell}>
                        {sortBy === 'level' ? level : null}
                      </td>
                    </tr>
                  )
                })}
                {corrections.map((c) => (
                  <tr key={c.id ?? `${c.original_phrase}-${c.timestamp}`} className={styles.dataRow}>
                    <td className={styles.cellOriginal}>{c.original_phrase}</td>
                    <td className={styles.cellCorrected}>{c.corrected_phrase}</td>
                    <td className={styles.cellWhy}>{c.explanation}</td>
                    <td className={styles.cellLevel}>{c.error_level}</td>
                    <td className={styles.cellType}>
                      {c.category && <span className={styles.badge}>{c.category}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
