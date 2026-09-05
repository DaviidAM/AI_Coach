'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './AudioPlayer.module.css'

interface AudioPlayerProps {
  src: string
  /**
   * Who is speaking? Used for the "You" / "Coach" label.
   * Whichever role owns this audio is also what styles the player
   * (the parent <span> carries messageUser / messageCoach classes,
   *  and CSS Module :global rules style the inner buttons).
   */
  variant?: 'user' | 'coach'
}

/**
 * WhatsApp-style audio bubble.
 * Renders inline inside a chat bubble: play/pause, deterministic waveform,
 * duration and progress (mm:ss).
 *
 * Designed to live INSIDE a bubble (the parent .bubble carries the visual
 * styling and color); this component focuses on behavior.
 */
export function AudioPlayer({ src, variant = 'coach' }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [progress, setProgress] = useState(0) // 0..1
  const [error, setError] = useState<string | null>(null)

  // Reset state when src changes
  useEffect(() => {
    setIsPlaying(false)
    setDuration(0)
    setCurrentTime(0)
    setProgress(0)
    setError(null)
  }, [src])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('audio play failed', err)
          setError('Tap to retry')
        })
    }
  }

  function formatTime(secs: number): string {
    if (!isFinite(secs) || secs < 0) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Static waveform bars (deterministic per src so it doesn't jitter
  // between renders). 18 bars is enough density for visual rhythm
  // without being noisy.
  const bars = generateWaveform(src, 18)
  const label = variant === 'user' ? 'You' : 'Coach'

  return (
    <div className={styles.player} data-variant={variant}>
      <button
        type="button"
        className={styles.playBtn}
        onClick={toggle}
        aria-label={isPlaying ? 'Pause audio' : `Play ${label.toLowerCase()} audio`}
        data-testid="audio-play"
      >
        {isPlaying ? (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="3.5" y="2.5" width="3" height="11" rx="0.5" fill="currentColor" />
            <rect x="9.5" y="2.5" width="3" height="11" rx="0.5" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M5 2.5v11l8-5.5z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className={styles.waveform} aria-hidden="true">
        {bars.map((h, i) => {
          const filled = i / bars.length <= progress
          return (
            <span
              key={i}
              className={`${styles.bar} ${filled ? styles.barFilled : ''}`}
              style={{ height: `${h}%` }}
            />
          )
        })}
      </div>

      <div className={styles.meta}>
        {error ? (
          <span className={styles.error}>{error}</span>
        ) : (
          <>
            <span className={styles.label}>{label}</span>
            <span className={styles.duration}>{formatTime(isPlaying ? currentTime : duration)}</span>
          </>
        )}
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const a = e.currentTarget
          setDuration(a.duration || 0)
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          setCurrentTime(a.currentTime)
          if (a.duration) setProgress(a.currentTime / a.duration)
        }}
        onEnded={() => {
          setIsPlaying(false)
          setCurrentTime(0)
          setProgress(0)
        }}
        onError={() => setError('Unavailable')}
      />
    </div>
  )
}

/**
 * Deterministic pseudo-waveform from a string. Same src → same bars.
 * Heights in 30..100 range, tapered at the edges for a natural look.
 */
function generateWaveform(seed: string, count: number): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    const base = (h % 70) + 30 // 30..99
    // Taper edges with a sine bell so the waveform doesn't look square
    const t = Math.sin((Math.PI * (i + 1)) / (count + 1))
    out.push(Math.max(20, Math.round(base * t)))
  }
  return out
}
