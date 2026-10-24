import type { ReactNode } from 'react'
import { LeafIcon } from '@/components/icons/AppIcons'
import styles from './CoachHeader.module.css'

interface CoachHeaderProps {
  titleLead: string
  titleAccent: string
  subtitle: string
  headerBack?: ReactNode
  headerActions?: ReactNode
  sessionIcon: ReactNode
  sessionTitle: ReactNode
  sessionMeta: ReactNode
  sessionActions?: ReactNode
}

/**
 * Shared header for every coach: brand mark, split-colour title, subtitle and
 * the session context banner shown under it.
 */
export function CoachHeader({
  titleLead,
  titleAccent,
  subtitle,
  headerBack,
  headerActions,
  sessionIcon,
  sessionTitle,
  sessionMeta,
  sessionActions,
}: CoachHeaderProps) {
  return (
    <header className={styles.header}>
      {(headerBack || headerActions) && (
        <div className={styles.headerTop}>
          {headerBack && <div className={styles.headerBack}>{headerBack}</div>}
          {headerActions && <div className={styles.headerActions}>{headerActions}</div>}
        </div>
      )}

      <div className={styles.brandIcon} aria-hidden="true">
        <LeafIcon size={28} />
      </div>

      <h1 className={styles.title}>
        <span className={styles.titleLead}>{titleLead}</span>{' '}
        <span className={styles.titleAccent}>{titleAccent}</span>
      </h1>
      <p className={styles.subtitle}>{subtitle}</p>

      <section className={styles.session} data-purpose="session-context">
        <div className={styles.sessionMain}>
          <div className={styles.sessionIcon} aria-hidden="true">
            {sessionIcon}
          </div>
          <div className={styles.sessionText}>
            <h2 className={styles.sessionTitle}>{sessionTitle}</h2>
            <p className={styles.sessionMeta}>{sessionMeta}</p>
          </div>
        </div>
        {sessionActions && (
          <div className={styles.sessionActions}>{sessionActions}</div>
        )}
      </section>
    </header>
  )
}
