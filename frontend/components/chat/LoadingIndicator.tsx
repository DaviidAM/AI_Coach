import styles from './LoadingIndicator.module.css'

interface LoadingIndicatorProps {
  label?: string
}

export function LoadingIndicator({
  label = 'Coach is thinking…',
}: LoadingIndicatorProps) {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <div className={styles.dots} aria-hidden="true">
        <span /><span /><span />
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  )
}
