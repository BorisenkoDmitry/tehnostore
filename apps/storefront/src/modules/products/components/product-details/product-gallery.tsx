"use client"

import type { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Swiper, SwiperSlide } from "swiper/react"
import { A11y } from "swiper/modules"
import type { Swiper as SwiperInstance } from "swiper"
import styles from "./product-details.module.css"
import "swiper/css"
import "swiper/css/a11y"

export default function ProductGallery({ images, title }: { images: HttpTypes.StoreProductImage[]; title: string }) {
  const [active, setActive] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  const [zoomed, setZoomed] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const swiper = useRef<SwiperInstance | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const thumbs = useRef<(HTMLButtonElement | null)[]>([])
  const photoButtons = useRef<(HTMLButtonElement | null)[]>([])
  const current = images[active]
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  const move = (index: number, focus = false) => {
    const next = (index + images.length) % images.length
    if (swiper.current && !swiper.current.destroyed) swiper.current.slideTo(next, reducedMotion || focus ? 0 : 260)
    else setActive(next)
    if (focus) thumbs.current[next]?.focus({ preventScroll: true })
  }
  const onKeyDown = (event: KeyboardEvent, focus = false) => {
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? active + 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? active - 1
      : event.key === "Home" ? 0 : event.key === "End" ? images.length - 1 : undefined
    if (next !== undefined && images.length) { event.preventDefault(); move(next, focus) }
  }
  const photo = (image: HttpTypes.StoreProductImage | undefined, index: number, large = false) => image && !failed.includes(image.id)
    ? <Image key={image.id} src={image.url} alt={`${title} — фото ${index + 1}`} fill draggable={false} priority={!large && index === 0} loading={large || index !== 0 ? "lazy" : undefined} sizes={large ? "90vw" : "(max-width: 700px) 90vw, (max-width: 1100px) 50vw, 42vw"} className={styles.productImage} onError={() => setFailed((previous) => [...previous, image.id])} />
    : <span className={styles.noImage}>{image ? "Не удалось загрузить фото" : "Фото товара пока нет"}</span>
  const openZoom = () => {
    if (swiper.current && !swiper.current.allowClick) return
    setZoomed(true)
    dialog.current?.showModal()
  }

  return <div className={styles.gallery} aria-label="Фотографии товара">
    {images.length > 1 && <div className={styles.thumbnails} aria-label="Выбор фотографии" onKeyDown={(event) => onKeyDown(event, true)}>
      {images.map((image, index) => <button key={image.id} type="button" ref={(element) => { thumbs.current[index] = element }} className={styles.thumbnail} aria-label={`Фото ${index + 1} из ${images.length}`} aria-pressed={active === index} onClick={() => move(index)}>
        <Image src={image.url} alt="" fill sizes="72px" loading="lazy" />
      </button>)}
    </div>}
    <div className={styles.mainPhoto} data-testid="product-gallery-main" onKeyDown={(event) => onKeyDown(event)}>
      {images.length > 1 ? <Swiper modules={[A11y]} className={styles.productSlider} slidesPerView={1} speed={reducedMotion ? 0 : 260}
        threshold={8} touchStartPreventDefault={false} preventClicks preventClicksPropagation
        a11y={{ containerMessage: "Фотографии товара", containerRole: "group", itemRoleDescriptionMessage: "фотография", slideLabelMessage: "Фото {{index}} из {{slidesLength}}", scrollOnFocus: false }}
        onSwiper={(instance) => { swiper.current = instance }} onSlideChange={(instance) => setActive(instance.activeIndex)}>
        {images.map((image, index) => <SwiperSlide key={image.id} aria-hidden={active !== index} inert={active !== index}>
          <button type="button" ref={(element) => { photoButtons.current[index] = element }} className={styles.enlarge} onClick={openZoom} tabIndex={active === index ? 0 : -1} aria-label={`Увеличить фото ${index + 1}: ${title}`}>{photo(image, index)}</button>
        </SwiperSlide>)}
      </Swiper> : <button type="button" ref={(element) => { photoButtons.current[0] = element }} className={styles.enlarge} onClick={openZoom} disabled={!current} aria-label={`Увеличить фото 1: ${title}`}>{photo(current, 0)}</button>}
      {images.length > 1 && <>
        <div className={styles.galleryActions}><button type="button" aria-label="Предыдущее фото" onClick={() => move(active - 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button><button type="button" aria-label="Следующее фото" onClick={() => move(active + 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button></div>
        <span className={styles.photoCount} aria-live="polite" data-testid="product-photo-count">{active + 1} / {images.length}</span>
      </>}
    </div>
    <dialog ref={dialog} className={styles.lightbox} aria-label={`Фотографии: ${title}`} onClose={() => { setZoomed(false); photoButtons.current[active]?.focus({ preventScroll: true }) }} onKeyDown={(event) => onKeyDown(event)} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <button type="button" className={styles.closePhoto} onClick={() => dialog.current?.close()}>Закрыть</button>
      <div className={styles.largePhoto}>{zoomed && photo(current, active, true)}</div>
      {images.length > 1 && <div className={styles.photoNavigation}><button type="button" onClick={() => move(active - 1)}>Назад</button><span aria-live="polite">{active + 1} / {images.length}</span><button type="button" onClick={() => move(active + 1)}>Далее</button></div>}
    </dialog>
  </div>
}
