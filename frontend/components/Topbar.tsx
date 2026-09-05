'use client'

import { useEffect, useState } from 'react'
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

export function Topbar() {
  const [level, setLevelState] = useState<Level>('A2')
  const [theme, setThemeState] = useState<Theme>('dark')
  const [isMobile, setIsMobile] = useState(false)

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
        ) : (
          <div className={styles.chips} role="group" aria-label="CEFR level selector">
            {LEVELS.map((l) => (
              <button
                key={l}
                className={`${styles.chip} ${level === l ? styles.chipActive : ''}`}
                onClick={() => handleLevelChange(l)}
                aria-pressed={level === l}
              >
                {l}
              </button>
            ))}
          </div>
        )}

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
