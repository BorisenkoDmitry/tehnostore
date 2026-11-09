import { useEffect, useRef, useState } from "react"

export type Point = { x: number; y: number }
type View = Point & { zoom: number }
type Bounds = { left: number; top: number; right: number; bottom: number }
type Layout = Record<string, Point>
const defaultView: View = { x: 0, y: 0, zoom: 1 }
const zoomLimit = (zoom: number) => Math.max(0.25, Math.min(2.5, zoom))

function readSaved<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback }
  catch { return fallback }
}

function saveLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch { /* Private mode can disable persistent storage. */ }
}

const isPoint = (point: unknown): point is Point => !!point && typeof point === "object" &&
  Number.isFinite((point as Point).x) && Number.isFinite((point as Point).y)

export function useCanvasSession<T>(scope: string, name: string, fallback: T) {
  const key = `catalog-constructor:draft:v1:${scope}:${name}`
  const [state, setState] = useState<T>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? fallback }
    catch { return fallback }
  })
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(state)) }
    catch { /* The current page can still keep the staged changes in memory. */ }
  }, [key, state])
  return [state, setState] as const
}

export function useRemovedCanvasCards(scope: string) {
  const key = `catalog-constructor:canvas:v1:${scope}:hidden`
  const [removedCards, setRemovedCards] = useState<string[]>(() => readSaved(key, []))
  useEffect(() => { saveLocal(key, removedCards) }, [key, removedCards])
  return [removedCards, setRemovedCards] as const
}

export function useCatalogViewport(scope: string) {
  const key = `catalog-constructor:canvas:v1:${scope}`
  const viewport = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(() => {
    const saved = readSaved(key + ":view", defaultView)
    return isPoint(saved) && Number.isFinite(saved.zoom) ? { ...saved, zoom: zoomLimit(saved.zoom) } : defaultView
  })
  const [layout, setLayout] = useState<Layout>(() => {
    const saved = readSaved<Layout>(key + ":layout", {})
    return Object.fromEntries(Object.entries(saved).filter(([, position]) => isPoint(position)))
  })
  const current = useRef(view)
  const positions = useRef(layout)
  const updateView = (next: View, persist = true) => {
    current.current = next
    setView(next)
    if (persist) saveLocal(key + ":view", next)
  }
  const updateNode = (id: string, point: Point | undefined) => {
    const next = { ...positions.current }
    if (point) next[id] = point
    else delete next[id]
    positions.current = next
    setLayout(next)
  }
  const persist = () => {
    saveLocal(key + ":view", current.current)
    saveLocal(key + ":layout", positions.current)
  }
  const worldPoint = (clientX: number, clientY: number): Point => {
    const box = viewport.current?.getBoundingClientRect()
    const { x, y, zoom } = current.current
    return { x: (clientX - (box?.left ?? 0) - x) / zoom, y: (clientY - (box?.top ?? 0) - y) / zoom }
  }
  const zoomAt = (factor: number, anchor?: Point) => {
    const previous = current.current
    const x = anchor?.x ?? (viewport.current?.clientWidth ?? 0) / 2
    const y = anchor?.y ?? (viewport.current?.clientHeight ?? 0) / 2
    const zoom = zoomLimit(previous.zoom * factor)
    const ratio = zoom / previous.zoom
    updateView({ zoom, x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio })
  }
  const fit = (bounds: Bounds | undefined) => {
    if (!viewport.current || !bounds) { updateView(defaultView); return }
    const padding = 28
    const width = bounds.right - bounds.left
    const height = bounds.bottom - bounds.top
    const { clientWidth, clientHeight } = viewport.current
    const zoom = Math.min(1, zoomLimit(Math.min((clientWidth - padding * 2) / width, (clientHeight - padding * 2) / height)))
    updateView({ zoom, x: (clientWidth - width * zoom) / 2 - bounds.left * zoom, y: (clientHeight - height * zoom) / 2 - bounds.top * zoom })
  }
  const reveal = (bounds: Bounds) => {
    if (!viewport.current) return
    const previous = current.current
    const { zoom } = previous
    const { clientWidth, clientHeight } = viewport.current
    const x = previous.x + bounds.left * zoom
    const y = previous.y + bounds.top * zoom
    if (x >= 0 && y >= 0 && previous.x + bounds.right * zoom <= clientWidth && previous.y + bounds.bottom * zoom <= clientHeight) return
    updateView({
      zoom,
      x: clientWidth / 2 - (bounds.left + bounds.right) / 2 * zoom,
      y: clientHeight / 2 - (bounds.top + bounds.bottom) / 2 * zoom,
    })
  }
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const previous = current.current
        updateView({ ...previous, x: previous.x - (event.deltaX || event.deltaY) * scale, y: previous.y - (event.shiftKey ? 0 : event.deltaY * scale) })
        return
      }
      const box = element.getBoundingClientRect()
      zoomAt(Math.exp(-event.deltaY * scale * (event.ctrlKey ? 0.008 : 0.0015)), { x: event.clientX - box.left, y: event.clientY - box.top })
    }
    element.addEventListener("wheel", wheel, { passive: false })
    return () => element.removeEventListener("wheel", wheel)
  }, [key])
  return { viewport, view, current, layout, positions, worldPoint, updateNode, updateView, persist, zoomAt, fit, reveal, reset: () => updateView(defaultView) }
}
