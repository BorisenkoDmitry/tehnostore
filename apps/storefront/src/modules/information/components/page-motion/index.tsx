"use client"

import { useEffect, useRef } from "react"

/** Keep the first painted viewport stable. Arm only content still below it. */
export default function InformationMotion({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const article = root.current
    if (!article) return
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    const elements = Array.from(
      article.querySelectorAll<HTMLElement>("[data-information-reveal]")
    )
    const running = new Map<HTMLElement, Animation>()
    let disposed = false

    const finish = (element: HTMLElement) => {
      element.dataset.informationState = "seen"
      const animation = running.get(element)
      running.delete(element)
      animation?.cancel()
    }
    const settle = () => {
      observer?.disconnect()
      elements.forEach(finish)
    }
    if (
      preference.matches ||
      typeof IntersectionObserver === "undefined" ||
      typeof article.animate !== "function"
    ) {
      elements.forEach(finish)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (disposed) return
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const element = entry.target as HTMLElement
          observer?.unobserve(element)
          if (element.dataset.informationState !== "pending") continue
          element.dataset.informationState = "revealing"
          const animation = element.animate(
            [
              { opacity: 0, transform: "translateY(16px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            {
              duration: 600,
              delay: Math.min(Number(element.dataset.delay || 0), 2) * 65,
              easing: "cubic-bezier(.16, 1, .3, 1)",
              fill: "both",
            }
          )
          running.set(element, animation)
          animation.onfinish = () => finish(element)
        }
      },
      { threshold: 0.08 }
    )

    elements.forEach((element) => {
      if (element.dataset.informationState === "seen") return
      // SSR content already on screen must never rewind during hydration,
      // client navigation, browser scroll restoration or Strict Mode replay.
      if (element.getBoundingClientRect().top < window.innerHeight + 32)
        finish(element)
      else {
        element.dataset.informationState = "pending"
        observer?.observe(element)
      }
    })
    const onPreference = () => {
      if (preference.matches) settle()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) settle()
    }
    preference.addEventListener("change", onPreference)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      disposed = true
      observer?.disconnect()
      running.forEach((_, element) => finish(element))
      elements.forEach((element) => {
        if (element.dataset.informationState === "pending")
          delete element.dataset.informationState
      })
      preference.removeEventListener("change", onPreference)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [])
  return (
    <article ref={root} className={className}>
      {children}
    </article>
  )
}
