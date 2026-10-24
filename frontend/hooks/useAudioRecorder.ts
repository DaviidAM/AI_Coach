'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseAudioRecorderOptions {
  /** False while the chat is busy, at its limit or not configured yet. */
  enabled?: boolean
  onAudio: (blob: Blob) => void | Promise<void>
  onError?: (message: string) => void
}

interface UseAudioRecorderResult {
  recording: boolean
  startRecording: () => Promise<void>
  stopRecording: () => void
}

/**
 * Hold-to-record microphone logic shared by every coach.
 *
 * The hook owns the MediaRecorder lifecycle and reports a finished Blob to
 * the caller. UI-specific error handling stays in the page via `onError`.
 */
export function useAudioRecorder({
  enabled = true,
  onAudio,
  onError,
}: UseAudioRecorderOptions): UseAudioRecorderResult {
  const [recording, setRecording] = useState(false)

  const enabledRef = useRef(enabled)
  const onAudioRef = useRef(onAudio)
  const onErrorRef = useRef(onError)
  const mountedRef = useRef(true)
  const recordingRef = useRef(false)
  const pressActiveRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    onAudioRef.current = onAudio
  }, [onAudio])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const stopRecording = useCallback(() => {
    pressActiveRef.current = false
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    recordingRef.current = false
    if (mountedRef.current) setRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    if (!enabledRef.current || recordingRef.current) return
    pressActiveRef.current = true

    const reportError = (message: string) => onErrorRef.current?.(message)

    if (!navigator.mediaDevices?.getUserMedia) {
      reportError('Microphone API not available in this browser.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      reportError('MediaRecorder not supported in this browser.')
      return
    }

    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // The user may have released the mic button while the browser was
      // asking for permission. In that case, cancel the pending recording.
      if (!mountedRef.current || !pressActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onerror = () => {
        stopStream()
        recordingRef.current = false
        pressActiveRef.current = false
        mediaRecorderRef.current = null
        if (!mountedRef.current) return
        setRecording(false)
        reportError('Recording failed. Check your microphone and try again.')
      }

      recorder.onstop = async () => {
        const chunks = chunksRef.current
        chunksRef.current = []
        stopStream()
        mediaRecorderRef.current = null
        recordingRef.current = false
        pressActiveRef.current = false
        if (!mountedRef.current) return
        setRecording(false)

        if (chunks.length === 0) {
          reportError('No audio was recorded. Hold the mic and try again.')
          return
        }

        const producedType = chunks[0]?.type || 'audio/webm'
        const blob = new Blob(chunks, { type: producedType })
        try {
          await onAudioRef.current(blob)
        } catch (err) {
          console.error('audio submit error', err)
          reportError('Could not process the recording. Please try again.')
        }
      }

      recorder.start()
      recordingRef.current = true
      setRecording(true)
    } catch (err: any) {
      console.error('microphone error', err)
      stream?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recordingRef.current = false
      pressActiveRef.current = false
      if (mountedRef.current) setRecording(false)
      reportError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow access in the browser.'
          : 'Microphone unavailable. Check browser permissions.'
      )
    }
  }, [stopStream])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      stopStream()
    }
  }, [stopStream])

  return { recording, startRecording, stopRecording }
}
