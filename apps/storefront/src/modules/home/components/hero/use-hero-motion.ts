"use client"

import { useEffect, useRef } from "react"
import type { Swiper } from "swiper"
import { createLiquidReveal, revealWithoutWebGL } from "./liquid-reveal"

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

/** A settled slide reveals its layers once. Swiper alone owns slide transforms. */
export function useHeroMotion(swiper: Swiper | null, reduced: boolean) {
  const running = useRef<Animation[]>([])

  useEffect(() => {
    if (!swiper || swiper.destroyed) return
    const slides = () => (swiper.slides ?? []) as HTMLElement[]
    let liquid: ReturnType<typeof createLiquidReveal> | undefined
    let stopLiquid: (() => void) | undefined
    const finish = () => {
      // Restore the visible CSS state before a gesture can interrupt an entrance.
      running.current.forEach(animation => animation.cancel())
      running.current = []
      stopLiquid?.()
      stopLiquid = undefined
    }
    const resetInactive = (active: HTMLElement) => {
      slides().forEach(slide => {
        slide.dataset.heroPending = String(slide !== active && !reduced)
      })
    }
    const reveal = () => {
      if (swiper.destroyed || swiper.animating || swiper.touchEventsData.isTouched) return
      const active = slides()[swiper.activeIndex]
      if (!active) return
      const pending = active.dataset.heroPending === "true"
      finish()
      resetInactive(active)
      if (!pending || reduced || typeof active.animate !== "function") return

      const animate = (selector: string, frames: Keyframe[], duration: number, delay: number) => {
        const element = active.querySelector<HTMLElement>(selector)
        if (!element) return
        const animation = element.animate(frames, { duration, delay, easing: ease, fill: "backwards" })
        running.current.push(animation)
      }

      // Masks follow the authored title lines, including natural wraps on mobile.
      active.querySelectorAll("[data-hero-line]").forEach((_, line) => {
        animate(`[data-hero-line="${line}"]`, [
          { clipPath: "inset(-.25em calc(100% + .2em) -.25em -.2em)", transform: "translate3d(-12px, 0, 0)" },
          { clipPath: "inset(-.25em -.2em -.25em -.2em)", transform: "translate3d(0, 0, 0)" },
        ], 480, Math.min(line * 55, 165))
      })
      animate(".texno-hero-description", [
        { opacity: 0, clipPath: "inset(0 35% 0 0)" },
        { opacity: 1, clipPath: "inset(0 0 0 0)" },
      ], 420, 100)
      animate(".texno-hero-action", [
        { opacity: 0, clipPath: "inset(0 100% 0 0 round 8px)" },
        { opacity: 1, clipPath: "inset(0 0 0 0 round 8px)" },
      ], 380, 165)
      const picture = active.querySelector<HTMLElement>(".texno-hero-artwork")
      if (picture) {
        if (liquid === undefined) liquid = createLiquidReveal()
        stopLiquid = liquid ? liquid.play(picture, 135) : revealWithoutWebGL(picture, 135)
      }
    }

    // The server-rendered first slide stays visible; only subsequent slides wait.
    resetInactive(slides()[swiper.activeIndex])
    swiper.on("sliderFirstMove", finish)
    swiper.on("slideChange", finish)
    swiper.on("transitionEnd", reveal)
    swiper.on("resize", finish)
    const onVisibility = () => { if (document.hidden) finish() }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      swiper.off("sliderFirstMove", finish)
      swiper.off("slideChange", finish)
      swiper.off("transitionEnd", reveal)
      swiper.off("resize", finish)
      document.removeEventListener("visibilitychange", onVisibility)
      finish()
      liquid?.destroy()
      slides().forEach(slide => delete slide.dataset.heroPending)
    }
  }, [swiper, reduced])

  return () => running.current.forEach(animation => animation.finish())
}
