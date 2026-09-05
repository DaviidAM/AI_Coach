'use client'

import { useEffect, useRef, useState } from 'react'
import { LEVELS, Level, Theme } from '@/types'
import { getLevel, setLevel } from '@/lib/api'
import styles from './Topbar.module.css'

const THEME_KEY = 'ai-coach-theme'
const SESSION_KEY = 'ai-coach-session-id'

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem(THEME_KEY) as Theme) || 'dark'
}

function setStoredTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme)
  document.documentElement.setAttribute('data-theme', theme)
}

function getStoredSessionId(): string {
  if (typeof window === 'undefined') return ''
  let sid = localStorage.getItem(SESSION_KEY)
  if (!sid) {
    sid = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, sid)
  }
  return sid
}

export function Topbar({ errorCount = 0, onOpenErrors }: { errorCount?: number; onOpenErrors?: () => void }) {
  const [level, setLevelState] = useState<Level>('A2')
  const [theme, setThemeState] = useState<Theme>('dark')
  const [isMobile, setIsMobile] = useState(false)
  const [levelMenuOpen, setLevelMenuOpen] = useState(false)
  const levelMenuRef = useRef<HTMLDivElement>(null)

  // Load initial state
  useEffect(() => {
    // Theme
    const storedTheme = getStoredTheme()
    setThemeState(storedTheme)
    document.documentElement.setAttribute('data-theme', storedTheme)

    // Level from API
    const sid = getStoredSessionId()
    getLevel(sid)
      .then((l) => setLevelState(l))
      .catch(() => setLevelState('A2'))

    // Mobile detection
    const mq = window.matchMedia('(max-width: 479px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Close level menu on outside click or Escape
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
      await setLevel(newLevel, getStoredSessionId())
    } catch {
      // revert on error
      setLevelState(prev)
    }
  }

  const handleLevelSelect = (l: Level) => {
    setLevelMenuOpen(false)
    handleLevelChange(l)
  }

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setThemeState(next)
    setStoredTheme(next)
  }

  return (
    <nav className={styles.topbar}>
      <div className={styles.left}>
        <span className={styles.logo} aria-hidden="true">🎯</span>
        <span className={styles.brand}>AI Coach</span>
      </div>

      <div className={styles.center}>
        <span className={styles.lang}>English · voice & text</span>
      </div>

      <div className={styles.right}>
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
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </>
        ) : (
          <div className={styles.levelSelector} ref={levelMenuRef}>
            <button
              type="button"
              className={styles.levelSelectorBtn}
              onClick={() => setLevelMenuOpen(!levelMenuOpen)}
              aria-haspopup="listbox"
              aria-expanded={levelMenuOpen}
            >
              <span className={styles.levelLabel}>English Level:</span>
              <span className={styles.levelValue}>{level}</span>
              <span
                className={`${styles.levelCaret} ${levelMenuOpen ? styles.levelCaretOpen : ''}`}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>
            {levelMenuOpen && (
              <ul
                className={styles.levelMenu}
                role="listbox"
                aria-label="English level"
              >
                {LEVELS.map((l) => (
                  <li key={l} role="option" aria-selected={l === level}>
                    <button
                      type="button"
                      className={l === level ? styles.levelMenuItemActive : styles.levelMenuItem}
                      onClick={() => handleLevelSelect(l)}
                    >
                      <span className={styles.levelMenuLevel}>{l}</span>
                      <span className={styles.levelMenuName}>
                        {l === 'A1' ? 'Beginner' :
                         l === 'A2' ? 'Elementary' :
                         l === 'B1' ? 'Intermediate' :
                         l === 'B2' ? 'Upper-Int.' :
                         l === 'C1' ? 'Advanced' :
                         l === 'C2' ? 'Proficient' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          className={styles.errorsButton}
          onClick={onOpenErrors}
          aria-label="View all corrections"
          title="View all corrections"
        >
          <span className={styles.errorsButtonLabel}>All Corrections</span>
          {errorCount > 0 && <span className={styles.errorsBadge}>{errorCount}</span>}
        </button>

        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  )
}
