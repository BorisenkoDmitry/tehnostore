"use client"

import { useCallback, useEffect, useRef } from "react"

/** Debounce an action, with explicit immediate execution and cancellation. */
export default function useDebounce<T>(callback: (value: T) => void, delay = 300) {
  const latest = useRef(callback)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { latest.current = callback }, [callback])
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => cancel, [cancel])
  const run = useCallback((value: T) => {
    cancel()
    timer.current = setTimeout(() => { timer.current = null; latest.current(value) }, delay)
  }, [cancel, delay])
  const flush = useCallback((value: T) => { cancel(); latest.current(value) }, [cancel])
  return { run, cancel, flush }
}
