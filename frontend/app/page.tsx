'use client'

import Link from 'next/link'
import { BookOpenIcon, BriefcaseIcon, LeafIcon } from '@/components/icons/AppIcons'
import { useTheme } from '@/hooks/useTheme'
import headerStyles from '@/components/chat/HeaderControls.module.css'
import styles from './landing.module.css'

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme()

  return (
    <main className={styles.page}>
      <div className={`${styles.ambient} ${styles.ambientAmber}`} aria-hidden="true" />
      <div className={`${styles.ambient} ${styles.ambientEmerald}`} aria-hidden="true" />
      <div className={`${styles.ambient} ${styles.ambientMint}`} aria-hidden="true" />

      <section className={styles.landingCard} aria-labelledby="landing-title">
        <div className={styles.landingHeader}>
          <div className={styles.brand}>
            <div className={styles.brandIcon} aria-hidden="true">
              <LeafIcon size={24} />
            </div>
            <span className={styles.brandName}>AI Coach</span>
          </div>

          <button
            type="button"
            className={headerStyles.themeToggle}
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <header className={styles.hero}>
          <p className={styles.eyebrow}>Two coaches. One practice space.</p>
          <h1 id="landing-title" className={styles.title}>
            <span className={styles.titleLead}>Choose your</span>{' '}
            <span className={styles.titleAccent}>coach</span>
          </h1>
          <p className={styles.subtitle}>
            Practise the conversation you need today. Both coaches support text and
            audio, keep their own session, and give you focused feedback.
          </p>
        </header>

        <div className={styles.cards}>
          <Link
            href="/english"
            className={`${styles.coachCard} ${styles.englishCard}`}
            data-accent="english"
          >
            <div className={styles.cardTop}>
              <div className={styles.cardIcon} aria-hidden="true">
                <BookOpenIcon size={26} />
              </div>
              <span className={styles.cardKicker}>Conversation</span>
            </div>
            <h2 className={styles.cardTitle}>English Coach</h2>
            <p className={styles.cardDescription}>
              Build fluency with everyday conversation, CEFR-aware corrections and
              audio on every message.
            </p>
            <ul className={styles.featureList}>
              <li>Corrections matched to your level</li>
              <li>Type or record your message</li>
              <li>Text and audio for every turn</li>
            </ul>
            <span className={styles.cardCta}>
              Open English Coach <span aria-hidden="true">→</span>
            </span>
          </Link>

          <Link
            href="/interview"
            className={`${styles.coachCard} ${styles.interviewCard}`}
            data-accent="interview"
          >
            <div className={styles.cardTop}>
              <div className={styles.cardIcon} aria-hidden="true">
                <BriefcaseIcon size={26} />
              </div>
              <span className={styles.cardKicker}>Career practice</span>
            </div>
            <h2 className={styles.cardTitle}>Interview Coach</h2>
            <p className={styles.cardDescription}>
              Practise a role-specific interview with live coaching and a final
              readiness report built around the job offer.
            </p>
            <ul className={styles.featureList}>
              <li>Tailored to the role and company</li>
              <li>Introduction, technical and final stages</li>
              <li>Feedback after every answer</li>
            </ul>
            <span className={styles.cardCta}>
              Open Interview Coach <span aria-hidden="true">→</span>
            </span>
          </Link>
        </div>

        <footer className={styles.footer}>
          <span className={styles.footerDot} aria-hidden="true" />
          <span>Choose a coach to start. Each practice space keeps its own session.</span>
        </footer>
      </section>
    </main>
  )
}
