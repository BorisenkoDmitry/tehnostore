"use client"

import Image from "next/image"
import StoreButton from "@modules/common/components/store-button"
import { CSSProperties, KeyboardEvent, useEffect, useRef, useState } from "react"
import { Swiper, SwiperSlide } from "swiper/react"
import { A11y, Autoplay, EffectCreative } from "swiper/modules"
import type { Swiper as SwiperInstance } from "swiper"
import { useCatalog } from "@modules/layout/components/storefront-shell"
import { heroSlides } from "./slides"
import "swiper/css"
import "swiper/css/effect-creative"

export default function Hero() {
  const { openCatalog, navigationOpen } = useCatalog()
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null)
  const [active, setActive] = useState(0)
  const [flow, setFlow] = useState({ from: 0, to: 0, sequence: 0 })
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  const [motionReduced, setMotionReduced] = useState(false)
  const hero = useRef<HTMLElement>(null)
  const controls = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setMotionReduced(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (!swiper || swiper.destroyed) return
    if (motionReduced || keyboardFocus || navigationOpen) swiper.autoplay.stop()
    else swiper.autoplay.start()
  }, [swiper, motionReduced, keyboardFocus, navigationOpen])

  const selectSlide = (index: number) => {
    if (!swiper || swiper.destroyed) return
    swiper.slideToLoop(index, motionReduced ? 0 : 760)
  }
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    let target = active
    if (event.key === "ArrowDown" || event.key === "ArrowRight") target = (active + 1) % heroSlides.length
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") target = (active - 1 + heroSlides.length) % heroSlides.length
    else if (event.key === "Home") target = 0
    else if (event.key === "End") target = heroSlides.length - 1
    else return
    event.preventDefault()
    selectSlide(target)
    controls.current[target]?.focus()
  }
  const flowStyle = {
    "--flow-from": `${flow.from * 68 + 6}px`,
    "--flow-to": `${flow.to * 68 + 6}px`,
    "--flow-top": `${Math.min(flow.from, flow.to) * 68 + 6}px`,
    "--flow-length": `${Math.abs(flow.from - flow.to) * 68 + 56}px`,
  } as CSSProperties

  return <section ref={hero} className="texno-hero texno-carousel" aria-label="Смартфоны и аксессуары" aria-roledescription="карусель"
    onPointerDownCapture={() => setKeyboardFocus(false)}
    onKeyDownCapture={() => setKeyboardFocus(true)}
    onFocusCapture={(event) => setKeyboardFocus(event.target.matches(":focus-visible"))}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardFocus(false) }}>
    <Swiper className="texno-hero-swiper" modules={[A11y, Autoplay, EffectCreative]} onSwiper={setSwiper}
      slidesPerView={1} loop speed={motionReduced ? 0 : 760} effect="creative"
      creativeEffect={{ prev: { translate: [0, 0, -1] }, next: { translate: [0, "100%", 0] }, limitProgress: 1 }}
      autoplay={{ delay: 7000, disableOnInteraction: false, pauseOnMouseEnter: false }}
      touchStartPreventDefault={false} touchAngle={35} resistanceRatio={0}
      a11y={{ enabled: true, slideRole: "tabpanel", slideLabelMessage: "{{index}} из {{slidesLength}}", wrapperLiveRegion: false }}
      onSlideChange={(instance) => {
        const next = instance.realIndex
        setActive(next)
        setFlow((current) => current.to === next ? current : { from: current.to, to: next, sequence: current.sequence + 1 })
      }}>
      {heroSlides.map((slide, index) => <SwiperSlide key={slide.id} id={`hero-slide-${index}`} aria-labelledby={`hero-tab-${index}`} aria-hidden={active !== index} inert={active !== index} className={`texno-slide ${active === index ? "is-active" : ""}`}>
        <picture className="texno-hero-artwork">
          <source media="(max-width: 600px)" srcSet={slide.mobileImage} type="image/webp" />
          <Image className="texno-hero-image" src={slide.image} alt={slide.alt} fill sizes="(max-width: 600px) 100vw, (max-width: 1440px) 55vw, 780px" loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "low"} />
        </picture>
        <div className="texno-container texno-hero-inner"><div className="texno-hero-content">
          <h2 className="texno-slide-title">{slide.title[0]}<br />{slide.title[1]}</h2>
          <p>{slide.description}</p>
          <StoreButton onClick={openCatalog}>{slide.button}</StoreButton>
        </div></div>
      </SwiperSlide>)}
    </Swiper>
    <div className="texno-hero-bottom texno-container"><div className="texno-slide-controls" role="tablist" aria-label="Выбрать слайд" aria-orientation="horizontal" onKeyDown={keyboard}>
      {heroSlides.map((slide, index) => <button key={slide.id} ref={(element) => { controls.current[index] = element }} id={`hero-tab-${index}`} role="tab" aria-selected={active === index} aria-controls={`hero-slide-${index}`} aria-label={`${index + 1}. ${slide.label}`} tabIndex={active === index ? 0 : -1} onClick={() => selectSlide(index)}><span className="texno-slide-rail" /></button>)}
      <span key={flow.sequence} className={`texno-slide-flow ${flow.sequence ? "is-flowing" : ""}`} style={flowStyle} aria-hidden="true" />
    </div></div>
    <p className="sr-only" aria-live={keyboardFocus ? "polite" : "off"} aria-atomic="true">{heroSlides[active].label}, слайд {active + 1} из 4</p>
  </section>
}
