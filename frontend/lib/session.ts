/**
 * Session ids are created in the browser and reused across reloads.
 * Each coach passes its own storage key so sessions never collide.
 */
export function getOrCreateSessionId(storageKey: string): string {
  if (typeof window === 'undefined') return crypto.randomUUID()

  const existing = localStorage.getItem(storageKey)
  if (existing) return existing

  const sessionId = crypto.randomUUID()
  localStorage.setItem(storageKey, sessionId)
  return sessionId
}
