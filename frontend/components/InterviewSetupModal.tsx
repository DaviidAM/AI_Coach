'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { InterviewSkillInfo, InterviewType } from '@/types/interview'
import styles from './InterviewSetupModal.module.css'

const ACCEPTED_EXTENSIONS = ['txt', 'md', 'markdown', 'pdf', 'docx']
const MAX_FILE_BYTES = 5 * 1024 * 1024

interface InterviewSetupModalProps {
  open: boolean
  skills: InterviewSkillInfo[]
  initialType?: InterviewType
  canClose: boolean
  busy: boolean
  error: string | null
  onClose: () => void
  onClearError?: () => void
  onSubmit: (payload: {
    interviewType: InterviewType
    jobText?: string
    jobFile?: File
  }) => void | Promise<void>
}

export function InterviewSetupModal({
  open,
  skills,
  initialType,
  canClose,
  busy,
  error,
  onClose,
  onClearError,
  onSubmit,
}: InterviewSetupModalProps) {
  const [mode, setMode] = useState<'paste' | 'upload'>('paste')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [interviewType, setInterviewType] = useState<InterviewType>(
    initialType ?? 'intro'
  )
  const [localError, setLocalError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setLocalError(null)
    setInterviewType(initialType ?? 'intro')
    // Focus the paste area when the modal opens for the first time.
    const timer = window.setTimeout(() => {
      if (mode === 'paste') textareaRef.current?.focus()
    }, 50)
    return () => window.clearTimeout(timer)
    // Intentionally run only when the modal opens / initial type changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialType])

  useEffect(() => {
    if (!open || !canClose) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, canClose, onClose])

  if (!open) return null

  const handleFile = (selected: File | null) => {
    setLocalError(null)
    if (!selected) {
      setFile(null)
      return
    }
    const extension = selected.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setFile(null)
      setLocalError('Upload a .txt, .md, .pdf or .docx file.')
      return
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null)
      setLocalError('The file is larger than 5 MB. Upload a smaller file or paste the text.')
      return
    }
    setFile(selected)
  }

  const handleSubmit = async () => {
    setLocalError(null)
    if (mode === 'paste' && !text.trim()) {
      setLocalError('Paste the job offer before starting.')
      return
    }
    if (mode === 'upload' && !file) {
      setLocalError('Choose a job-offer file before starting.')
      return
    }
    await onSubmit({
      interviewType,
      jobText: mode === 'paste' ? text.trim() : undefined,
      jobFile: mode === 'upload' ? file ?? undefined : undefined,
    })
  }

  const canSubmit =
    !busy && (mode === 'paste' ? text.trim().length > 0 : file !== null)
  const message = localError || error

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-setup-title"
      onMouseDown={(event) => {
        if (canClose && event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 id="interview-setup-title" className={styles.title}>
              Set up your interview
            </h2>
            <p className={styles.subtitle}>
              Add the job offer and choose the stage. Your interviewer will adapt to the
              role and give feedback on every answer.
            </p>
          </div>
          {canClose ? (
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close setup"
            >
              ✕
            </button>
          ) : (
            <Link href="/" className={styles.backLink}>
              ← English coach
            </Link>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>1. Job offer</div>
          <div className={styles.tabs} role="tablist" aria-label="Job offer input method">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'paste'}
              className={mode === 'paste' ? styles.tabActive : styles.tab}
              onClick={() => {
                setMode('paste')
                setLocalError(null)
              }}
            >
              Paste text
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'upload'}
              className={mode === 'upload' ? styles.tabActive : styles.tab}
              onClick={() => {
                setMode('upload')
                setLocalError(null)
              }}
            >
              Upload file
            </button>
          </div>

          {mode === 'paste' ? (
            <div className={styles.field}>
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste the full job description here — responsibilities, requirements, stack and seniority."
                rows={9}
                aria-label="Job offer text"
                maxLength={20000}
              />
              <div className={styles.fieldHint}>
                {text.length.toLocaleString()} / 20,000 characters
              </div>
            </div>
          ) : (
            <div className={styles.field}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.pdf,.docx"
                className={styles.fileInput}
                onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                aria-label="Job offer file"
              />
              <button
                type="button"
                className={styles.dropzone}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className={styles.dropIcon} aria-hidden="true">
                  ⇪
                </span>
                <span className={styles.dropTitle}>
                  {file ? file.name : 'Choose a job-offer file'}
                </span>
                <span className={styles.dropHint}>
                  {file
                    ? `${(file.size / 1024).toFixed(0)} KB — click to replace`
                    : '.txt, .md, .pdf or .docx · up to 5 MB'}
                </span>
              </button>
              {file && (
                <button
                  type="button"
                  className={styles.removeFile}
                  onClick={() => {
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  Remove file
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>2. Interview stage</div>
          <div
            className={styles.typeGrid}
            role="radiogroup"
            aria-label="Interview stage"
          >
            {skills.map((skill) => {
              const selected = interviewType === skill.id
              return (
                <button
                  key={skill.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? styles.typeCardActive : styles.typeCard}
                  onClick={() => setInterviewType(skill.id)}
                >
                  <span className={styles.typeTitle}>{skill.title}</span>
                  <span className={styles.typeDescription}>{skill.description}</span>
                </button>
              )
            })}
          </div>
          {skills.length === 0 && (
            <p className={styles.fieldHint}>Loading interview stages…</p>
          )}
        </div>

        {message && (
          <div className={styles.error} role="alert">
            <span>⚠️ {message}</span>
            <button
              type="button"
              onClick={() => {
                setLocalError(null)
                onClearError?.()
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className={styles.footer}>
          <p className={styles.privacy}>
            The offer is used only to tailor this practice interview.
          </p>
          <button
            type="button"
            className={styles.startBtn}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {busy ? 'Preparing your interviewer…' : 'Start interview →'}
          </button>
        </div>
      </div>
    </div>
  )
}
