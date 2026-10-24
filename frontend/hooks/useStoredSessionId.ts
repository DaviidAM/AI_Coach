'use client'

import { useEffect, useState } from 'react'
import { getOrCreateSessionId } from '@/lib/session'

/**
 * Restores the coach session id from localStorage after hydration.
 * The empty initial value keeps server and client markup identical.
 */
export function useStoredSessionId(storageKey: string): string {
  const [sessionId, setSessionId] = useState('')

  useEffect(() => {
    setSessionId(getOrCreateSessionId(storageKey))
  }, [storageKey])

  return sessionId
}
