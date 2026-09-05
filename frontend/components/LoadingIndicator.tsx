import styles from './LoadingIndicator.module.css'

export function LoadingIndicator() {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <div className={styles.dots} aria-hidden="true">
        <span /><span /><span />
      </div>
      <span className={styles.label}>Coach is thinking…</span>
    </div>
  )
}
