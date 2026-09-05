'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './AudioPlayer.module.css'

interface AudioPlayerProps {
  src: string
  // Display label (e.g. "You", "Coach"). Optional — falls back to generic.
  label?: string
}

/**
 * WhatsApp-style audio bubble.
 * Shows: play/pause button, animated waveform, and duration (mm:ss).
 *
 * Auto-fetches metadata once the <audio> element loads to compute duration,
 * since the API doesn't return audio duration. Falls back to "0:00" while loading.
 */
export function AudioPlayer({ src, label }: AudioPlayerProps) {
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
          setError('Tap again to enable audio')
        })
    }
  }

  function formatTime(secs: number): string {
    if (!isFinite(secs) || secs < 0) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Static waveform bars (deterministic per src so it doesn't jitter between renders).
  // 28 bars is close to WhatsApp's visual density.
  const bars = generateWaveform(src, 28)

  return (
    <div className={styles.player}>
      <button
        type="button"
        className={styles.playBtn}
        onClick={toggle}
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        data-testid="audio-play"
      >
        {isPlaying ? (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="0.5" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="0.5" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
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
        {label && <span className={styles.label}>{label}</span>}
        <span className={styles.duration}>{formatTime(isPlaying ? currentTime : duration)}</span>
        {error && <span className={styles.error}>{error}</span>}
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
        onError={() => setError('Audio unavailable')}
      />
    </div>
  )
}

/**
 * Deterministic pseudo-waveform from a string. Same src → same bars.
 * Heights in 25..100 range to look like a real voice waveform.
 */
function generateWaveform(seed: string, count: number): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    const base = (h % 75) + 25 // 25..99
    // Taper edges to look like a bell curve
    const t = Math.sin((Math.PI * (i + 1)) / (count + 1))
    out.push(Math.max(20, Math.round(base * t)))
  }
  return out
}
