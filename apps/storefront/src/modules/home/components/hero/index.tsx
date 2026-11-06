"use client"

import Image from "next/image"
import StoreButton from "@modules/common/components/store-button"
import { CSSProperties, KeyboardEvent, useEffect, useRef, useState } from "react"
import { useCatalog } from "@modules/layout/components/storefront-shell"
import { heroSlides } from "./slides"
import { useIdleAutoplay } from "./use-idle-autoplay"

export default function Hero() {
  const { openCatalog, navigationOpen } = useCatalog()
  const [active, setActive] = useState(0)
  const [requested, setRequested] = useState(0)
  const [previous, setPrevious] = useState<number | null>(null)
  const [entering, setEntering] = useState(false)
  const [mountedImages, setMountedImages] = useState([0])
  const [flow, setFlow] = useState({ from: 0, to: 0, sequence: 0 })
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  const [autoplayEpoch, setAutoplayEpoch] = useState(0)
  const [motionReduced, setMotionReduced] = useState(false)
  const [visible, setVisible] = useState(true)
  const hero = useRef<HTMLElement>(null)
  const readyImages = useRef(new Set<number>())
  const requestedIndex = useRef(0)
  const activeIndex = useRef(0)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const controls = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updateMotion = () => setMotionReduced(media.matches)
    updateMotion()
    media.addEventListener("change", updateMotion)
    let onScreen = true
    const updateVisibility = () => setVisible(onScreen && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting && entry.intersectionRatio >= .15
      updateVisibility()
    }, { threshold: [0, .15] })
    if (hero.current) observer.observe(hero.current)
    document.addEventListener("visibilitychange", updateVisibility)
    return () => {
      media.removeEventListener("change", updateMotion)
      document.removeEventListener("visibilitychange", updateVisibility)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!visible || navigationOpen) return
    // Preload only the next slide, after the first-screen request has settled.
    const preload = setTimeout(() => {
      const next = (active + 1) % heroSlides.length
      setMountedImages((mounted) => mounted.includes(next) ? mounted : [...mounted, next])
    }, 1200)
    return () => clearTimeout(preload)
  }, [active, visible, navigationOpen])

  const activateSlide = (index: number) => {
    if (index === activeIndex.current) return
    setPrevious(motionReduced ? null : activeIndex.current)
    setEntering(!motionReduced)
    activeIndex.current = index
    setActive(index)
  }

  const selectSlide = (index: number) => {
    if (index === requestedIndex.current) return
    const from = requestedIndex.current
    requestedIndex.current = index
    setFlow((current) => ({ from, to: index, sequence: current.sequence + 1 }))
    setRequested(index)
    setMountedImages((mounted) => mounted.includes(index) ? mounted : [...mounted, index])
    if (readyImages.current.has(index)) activateSlide(index)
  }

  const selectManualSlide = (index: number) => {
    setAutoplayEpoch((epoch) => epoch + 1)
    selectSlide(index)
  }

  useIdleAutoplay({
    enabled: !keyboardFocus && !motionReduced && visible && !navigationOpen && active === requested,
    onAdvance: () => selectSlide((requestedIndex.current + 1) % heroSlides.length),
    resetKey: `${active}:${requested}:${autoplayEpoch}`,
  })

  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    let target = requested
    if (event.key === "ArrowDown" || event.key === "ArrowRight") target = (requested + 1) % heroSlides.length
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") target = (requested - 1 + heroSlides.length) % heroSlides.length
    else if (event.key === "Home") target = 0
    else if (event.key === "End") target = heroSlides.length - 1
    else return
    event.preventDefault()
    selectManualSlide(target)
    controls.current[target]?.focus()
  }

  const flowStyle = {
    "--flow-from": `${flow.from * 68 + 6}px`,
    "--flow-to": `${flow.to * 68 + 6}px`,
    "--flow-top": `${Math.min(flow.from, flow.to) * 68 + 6}px`,
    "--flow-length": `${Math.abs(flow.from - flow.to) * 68 + 56}px`,
  } as CSSProperties

  return <section ref={hero} className="texno-hero texno-carousel" aria-label="Смартфоны и аксессуары" aria-roledescription="карусель" aria-busy={active !== requested}
    onPointerDownCapture={() => setKeyboardFocus(false)}
    onKeyDownCapture={() => setKeyboardFocus(true)}
    onFocusCapture={(event) => setKeyboardFocus(event.target.matches(":focus-visible"))}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardFocus(false) }}
    onTouchStart={(event) => { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY } }}
    onTouchEnd={(event) => {
      if (!touch.current) return
      const point = event.changedTouches[0]
      const dx = point.clientX - touch.current.x
      const dy = point.clientY - touch.current.y
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) selectManualSlide((requested + (dx < 0 ? 1 : -1) + heroSlides.length) % heroSlides.length)
      touch.current = null
    }}>
    {heroSlides.map((slide, index) => {
      const isActive = active === index
      const title = <>{slide.title[0]}<br />{slide.title[1]}</>
      return <div key={slide.id} id={`hero-slide-${index}`} role="tabpanel" aria-labelledby={`hero-tab-${index}`} aria-hidden={!isActive} inert={!isActive}
        className={`texno-slide ${isActive ? "is-active" : ""} ${previous === index ? "is-previous" : ""} ${isActive && entering ? "is-entering" : ""}`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === "texno-wave-cover" && isActive) {
            setEntering(false)
            setPrevious(null)
          }
        }}>
        {mountedImages.includes(index) && <picture className="texno-hero-artwork">
          <source media="(max-width: 600px)" srcSet={slide.mobileImage} type="image/webp" />
          <Image className="texno-hero-image" src={slide.image} alt={slide.alt} fill sizes="(max-width: 600px) 90vw, (max-width: 1440px) 50vw, 710px" loading="eager" fetchPriority={index === 0 ? "high" : requested === index ? "auto" : "low"} onLoad={() => {
            readyImages.current.add(index)
            if (requestedIndex.current === index) activateSlide(index)
          }} />
        </picture>}
        <div className="texno-container texno-hero-inner"><div className="texno-hero-content">
          <h2 className="texno-slide-title">{title}</h2>
          <p>{slide.description}</p>
          <StoreButton onClick={openCatalog}>{slide.button}</StoreButton>
        </div></div>
      </div>
    })}
    <div className="texno-hero-bottom texno-container"><div className="texno-slide-controls" role="tablist" aria-label="Выбрать слайд" aria-orientation="horizontal" onKeyDown={keyboard}>
      {heroSlides.map((slide, index) => <button key={slide.id} ref={(element) => { controls.current[index] = element }} id={`hero-tab-${index}`} role="tab" aria-selected={requested === index} aria-controls={`hero-slide-${index}`} aria-label={`${index + 1}. ${slide.label}`} tabIndex={requested === index ? 0 : -1} onClick={() => selectManualSlide(index)}><span className="texno-slide-rail" /></button>)}
      <span key={flow.sequence} className={`texno-slide-flow ${flow.sequence ? "is-flowing" : ""}`} style={flowStyle} aria-hidden="true" />
    </div></div>
    <p className="sr-only" aria-live={keyboardFocus ? "polite" : "off"} aria-atomic="true">{heroSlides[active].label}, слайд {active + 1} из 4</p>
  </section>
}
