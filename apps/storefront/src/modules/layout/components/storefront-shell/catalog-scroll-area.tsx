"use client"

import { KeyboardEvent, PointerEvent, ReactNode, useCallback, useEffect, useId, useRef, useState } from "react"

export default function CatalogScrollArea({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const frame = useRef<number | null>(null)
  const pointer = useRef<number | null>(null)
  const captureTarget = useRef<HTMLDivElement | null>(null)
  const dragOffset = useRef(11)
  const [scrollable, setScrollable] = useState(false)
  const id = useId()

  const cancelDrag = useCallback(() => {
    const pointerId = pointer.current
    const target = captureTarget.current
    pointer.current = null
    captureTarget.current = null
    if (pointerId === null || !target?.isConnected) return
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
    } catch (error) {
      // A pointer can become inactive between the capture check and release.
      if (!(error instanceof DOMException && ["NotFoundError", "InvalidStateError"].includes(error.name))) throw error
    }
  }, [])

  useEffect(() => {
    const target = rail.current
    const panel = target?.closest(".texno-catalog")
    const cancelHiddenDrag = () => {
      if (document.hidden || target?.closest("[inert], [hidden]")) cancelDrag()
    }
    const observer = new MutationObserver(cancelHiddenDrag)
    if (target) observer.observe(target, { attributes: true, attributeFilter: ["hidden"] })
    if (panel) observer.observe(panel, { attributes: true, attributeFilter: ["inert", "aria-hidden"] })
    window.addEventListener("blur", cancelDrag)
    document.addEventListener("visibilitychange", cancelHiddenDrag)
    return () => {
      observer.disconnect()
      window.removeEventListener("blur", cancelDrag)
      document.removeEventListener("visibilitychange", cancelHiddenDrag)
      cancelDrag()
    }
  }, [cancelDrag])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    frame.current = null
    const update = () => {
      frame.current = null
      const maximum = Math.max(0, element.scrollHeight - element.clientHeight)
      const progress = maximum ? Math.min(1, Math.max(0, element.scrollTop / maximum)) : 0
      setScrollable(maximum > 1)
      if (thumb.current) thumb.current.style.transform = `translate(-50%, ${progress * Math.max(0, element.clientHeight - 22)}px)`
      rail.current?.setAttribute("aria-valuenow", String(Math.round(progress * 100)))
    }
    const schedule = () => {
      if (frame.current === null) frame.current = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    if (content.current) observer.observe(content.current)
    element.addEventListener("scroll", schedule, { passive: true })
    schedule()
    return () => {
      observer.disconnect()
      element.removeEventListener("scroll", schedule)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [])

  const move = (clientY: number) => {
    if (!viewport.current || !rail.current) return
    if (!rail.current.isConnected || rail.current.closest("[inert], [hidden]")) { cancelDrag(); return }
    const bounds = rail.current.getBoundingClientRect()
    const progress = Math.min(1, Math.max(0, (clientY - bounds.top - dragOffset.current) / Math.max(1, bounds.height - 22)))
    viewport.current.scrollTop = progress * (viewport.current.scrollHeight - viewport.current.clientHeight)
  }
  const start = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    if ((event.pointerType === "mouse" && event.button !== 0) || !event.isPrimary || pointer.current !== null || !target.isConnected) return
    event.preventDefault()
    try {
      target.setPointerCapture(event.pointerId)
    } catch (error) {
      // Hydration replay or an interrupted gesture can carry an expired ID.
      if (error instanceof DOMException && ["NotFoundError", "InvalidStateError"].includes(error.name)) return
      throw error
    }
    pointer.current = event.pointerId
    captureTarget.current = target
    dragOffset.current = thumb.current?.contains(event.target as Node) ? event.clientY - thumb.current.getBoundingClientRect().top : 11
    target.focus({ preventScroll: true })
    move(event.clientY)
  }
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return
    cancelDrag()
  }
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const element = viewport.current
    if (!element) return
    let target = element.scrollTop
    if (event.key === "ArrowDown") target += 40
    else if (event.key === "ArrowUp") target -= 40
    else if (event.key === "PageDown") target += element.clientHeight * .85
    else if (event.key === "PageUp") target -= element.clientHeight * .85
    else if (event.key === "Home") target = 0
    else if (event.key === "End") target = element.scrollHeight
    else return
    event.preventDefault()
    element.scrollTop = target
  }

  return <div className="texno-catalog-scroll-area">
    <div ref={viewport} id={id} className="texno-catalog-body"><div ref={content}>{children}</div></div>
    <div ref={rail} className="texno-catalog-scrollbar" role="scrollbar" aria-label="Прокрутка каталога" aria-controls={id} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} tabIndex={0} hidden={!scrollable} onPointerDown={start} onPointerMove={(event) => { if (pointer.current === event.pointerId) move(event.clientY) }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={(event) => { if (pointer.current === event.pointerId) { pointer.current = null; captureTarget.current = null } }} onKeyDown={keyboard}>
      <span ref={thumb} className="texno-catalog-scroll-thumb"><span /></span>
    </div>
  </div>
}
