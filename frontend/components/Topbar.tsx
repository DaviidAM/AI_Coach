'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LEVELS, Level } from '@/types'
import { getLevel, setLevel } from '@/lib/api'
import { getOrCreateSessionId } from '@/lib/session'
import { useTheme } from '@/hooks/useTheme'
import { CoachHeader } from './chat/CoachHeader'
import headerStyles from './chat/HeaderControls.module.css'
import { BookOpenIcon } from './icons/AppIcons'
import styles from './Topbar.module.css'

const SESSION_KEY = 'ai-coach-session-id'

const LEVEL_NAMES: Record<Level, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper-Int.',
  C1: 'Advanced',
  C2: 'Proficient',
}

export function Topbar({
  errorCount = 0,
  onOpenErrors,
  messageCount,
  messageLimit,
}: {
  errorCount?: number
  onOpenErrors?: () => void
  messageCount?: number
  messageLimit?: number | null
}) {
  const [level, setLevelState] = useState<Level>('A2')
  const { theme, toggleTheme } = useTheme()
  const [isMobile, setIsMobile] = useState(false)
  const [levelMenuOpen, setLevelMenuOpen] = useState(false)
  const levelMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sid = getOrCreateSessionId(SESSION_KEY)
    getLevel(sid)
      .then((l) => setLevelState(l))
      .catch(() => setLevelState('A2'))

    const mq = window.matchMedia('(max-width: 479px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!levelMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (levelMenuRef.current && !levelMenuRef.current.contains(e.target as Node)) {
        setLevelMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLevelMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [levelMenuOpen])

  const handleLevelChange = async (newLevel: Level) => {
    const prev = level
    setLevelState(newLevel)
    try {
      await setLevel(newLevel, getOrCreateSessionId(SESSION_KEY))
    } catch {
      setLevelState(prev)
    }
  }

  const handleLevelSelect = (l: Level) => {
    setLevelMenuOpen(false)
    handleLevelChange(l)
  }

  return (
    <CoachHeader
      titleLead="English"
      titleAccent="Coach"
      subtitle="Practice today. Speak with confidence."
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
      sessionIcon={<BookOpenIcon size={24} />}
      sessionTitle="English practice"
      sessionMeta={
        <>
          <span>
            CEFR {level} · {LEVEL_NAMES[level]}
          </span>
          <span className={headerStyles.metaDot} aria-hidden="true">
            •
          </span>
          <span>Demo Version</span>
          {messageCount !== undefined && messageLimit != null && (
            <>
              <span className={headerStyles.metaDot} aria-hidden="true">
                •
              </span>
              <span
                className={`${headerStyles.usagePill} ${
                  messageCount === messageLimit ? headerStyles.usageLimit : ''
                }`}
              >
                {Math.min(messageCount, messageLimit)} of {messageLimit} demo messages used
              </span>
            </>
          )}
        </>
      }
      sessionActions={
        <>
          {isMobile ? (
            <>
              <span className={styles.levelLabel}>English Level:</span>
              <select
                className={styles.dropdown}
                value={level}
                onChange={(e) => handleLevelChange(e.target.value as Level)}
                aria-label="Select CEFR level"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <div className={styles.levelSelector} ref={levelMenuRef}>
              <button
                type="button"
                className={`${headerStyles.pill} ${styles.levelSelectorBtn}`}
                onClick={() => setLevelMenuOpen(!levelMenuOpen)}
                aria-haspopup="listbox"
                aria-expanded={levelMenuOpen}
              >
                <span className={styles.levelLabel}>English Level:</span>
                <span className={styles.levelValue}>{level}</span>
                <span
                  className={`${styles.levelCaret} ${
                    levelMenuOpen ? styles.levelCaretOpen : ''
                  }`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>
              {levelMenuOpen && (
                <ul className={styles.levelMenu} role="listbox" aria-label="English level">
                  {LEVELS.map((l) => (
                    <li key={l} role="option" aria-selected={l === level}>
                      <button
                        type="button"
                        className={
                          l === level
                            ? styles.levelMenuItemActive
                            : styles.levelMenuItem
                        }
                        onClick={() => handleLevelSelect(l)}
                      >
                        <span className={styles.levelMenuLevel}>{l}</span>
                        <span className={styles.levelMenuName}>{LEVEL_NAMES[l]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            className={`${headerStyles.pill} ${styles.errorsButton}`}
            onClick={onOpenErrors}
            aria-label="View all corrections"
            title="View all corrections"
          >
            <span>All Corrections</span>
            {errorCount > 0 && (
              <span className={headerStyles.badge}>{errorCount}</span>
            )}
          </button>
        </>
      }
    />
  )
}
