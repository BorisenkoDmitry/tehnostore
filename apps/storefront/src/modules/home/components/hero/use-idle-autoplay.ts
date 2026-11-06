"use client"

import { useEffect, useRef } from "react"

type IdleAutoplayOptions = {
  enabled: boolean
  onAdvance: () => void
  resetKey: string
  interval?: number
  quietPeriod?: number
}

export function useIdleAutoplay({ enabled, onAdvance, resetKey, interval = 7000, quietPeriod = 650 }: IdleAutoplayOptions) {
  const advance = useRef(onAdvance)
  const lastInteractionAt = useRef(0)
  const touching = useRef(false)

  useEffect(() => {
    advance.current = onAdvance
  }, [onAdvance])

  useEffect(() => {
    const scroll = () => { lastInteractionAt.current = performance.now() }
    const touch = (event: TouchEvent) => {
      touching.current = event.touches.length > 0
      lastInteractionAt.current = performance.now()
    }
    // Keep interaction refs current even while autoplay is disabled by an overlay.
    window.addEventListener("scroll", scroll, { passive: true })
    window.addEventListener("touchstart", touch, { passive: true })
    window.addEventListener("touchend", touch, { passive: true })
    window.addEventListener("touchcancel", touch, { passive: true })
    return () => {
      window.removeEventListener("scroll", scroll)
      window.removeEventListener("touchstart", touch)
      window.removeEventListener("touchend", touch)
      window.removeEventListener("touchcancel", touch)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    const cadence = Math.max(1, interval)
    const quiet = Math.max(1, quietPeriod)
    const schedule = (delay: number) => {
      if (cancelled) return
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(tick, delay)
    }
    const tick = () => {
      timer = null
      if (cancelled) return
      if (touching.current) {
        schedule(quiet)
        return
      }
      const idleFor = performance.now() - lastInteractionAt.current
      if (idleFor < quiet) {
        schedule(quiet - idleFor)
        return
      }
      advance.current()
      schedule(cadence)
    }
    schedule(cadence)
    return () => {
      cancelled = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [enabled, resetKey, interval, quietPeriod])
}
