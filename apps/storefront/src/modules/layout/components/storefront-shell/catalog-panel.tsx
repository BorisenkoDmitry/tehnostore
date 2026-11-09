"use client"

import { useEffect, useId, useRef, useState } from "react"
import * as Slider from "@radix-ui/react-slider"
import type { CatalogNode } from "@lib/data/navigation"
import StoreButton from "@modules/common/components/store-button"
import { useCatalogData } from "@modules/store/components/catalog-provider"
import CatalogAccordion from "./catalog-accordion"
import CatalogScrollArea from "./catalog-scroll-area"
import CatalogRangeFilter from "./catalog-range-filter"
import { ColorSwatchButton } from "@modules/common/components/color-swatch"
import { isColorAttribute } from "@lib/util/color-swatch"
import { CATALOG_CONTEXT_EVENT, parseCatalogState } from "@modules/store/lib/catalog-data"

type SliderPointer = { target: Element; id: number }
const stalePointer = (error: unknown) => error instanceof DOMException &&
  (error.name === "NotFoundError" || error.name === "InvalidStateError")
function releaseSliderPointer(pointer: SliderPointer | null) {
  if (!pointer?.target.isConnected) return
  try {
    if (pointer.target.hasPointerCapture(pointer.id)) pointer.target.releasePointerCapture(pointer.id)
  } catch (error) { if (!stalePointer(error)) throw error }
}

export default function CatalogPanel({ nodes, onSelect }: { nodes: CatalogNode[]; onSelect?: () => void }) {
  const { state, result, config, loading, contextLoading, error, update, navigate, getContextVersion, resetFilters: resetCatalog, resetKey, retry } = useCatalogData()
  const { min: urlMin, max: urlMax, category: urlCategory } = state
  const [minimum, setMinimum] = useState(state.min)
  const [maximum, setMaximum] = useState(state.max)
  const [priceError, setPriceError] = useState("")
  const priceErrorId = useId()
  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draft = useRef({ min: state.min, max: state.max, badMin: false, badMax: false })
  const revision = useRef(0)
  const submitted = useRef<{ min: string; max: string; category: string; revision: number } | null>(null)
  const urlState = useRef({ min: urlMin, max: urlMax, category: urlCategory })
  const resetVersion = useRef(resetKey)
  const currentState = useRef(state)
  const sliderPointer = useRef<SliderPointer | null>(null)
  const draftContext = useRef<number | null>(null)
  const cancelPriceTimer = () => {
    if (priceTimer.current !== null) clearTimeout(priceTimer.current)
    priceTimer.current = null
  }
  useEffect(() => () => { if (priceTimer.current !== null) clearTimeout(priceTimer.current) }, [])
  useEffect(() => {
    const cancelContext = () => {
      if (priceTimer.current !== null) clearTimeout(priceTimer.current)
      priceTimer.current = null
      draftContext.current = null
      submitted.current = null
      revision.current++
      releaseSliderPointer(sliderPointer.current)
      sliderPointer.current = null
      const current = parseCatalogState(new URLSearchParams(window.location.search))
      currentState.current = current
      draft.current = { min: current.min, max: current.max, badMin: false, badMax: false }
      setMinimum(current.min)
      setMaximum(current.max)
      setPriceError("")
    }
    window.addEventListener(CATALOG_CONTEXT_EVENT, cancelContext)
    return () => window.removeEventListener(CATALOG_CONTEXT_EVENT, cancelContext)
  }, [])
  useEffect(() => {
    const release = () => { releaseSliderPointer(sliderPointer.current); sliderPointer.current = null }
    window.addEventListener("blur", release)
    return () => { window.removeEventListener("blur", release); release() }
  }, [])
  useEffect(() => { currentState.current = state }, [state])
  useEffect(() => {
    const resetRequested = resetVersion.current !== resetKey
    resetVersion.current = resetKey
    const previous = urlState.current
    if (previous.min === urlMin && previous.max === urlMax && previous.category === urlCategory && !resetRequested) return
    urlState.current = { min: urlMin, max: urlMax, category: urlCategory }
    const ownUpdate = submitted.current
    submitted.current = null
    // A submitted range can be acknowledged after the next keystroke. Keep
    // that newer draft; network responses themselves never synchronize inputs.
    if (!resetRequested && ownUpdate && ownUpdate.min === urlMin && ownUpdate.max === urlMax &&
        ownUpdate.category === urlCategory && ownUpdate.revision < revision.current) return
    if (priceTimer.current !== null) clearTimeout(priceTimer.current)
    priceTimer.current = null
    draft.current = { min: urlMin, max: urlMax, badMin: false, badMax: false }
    setMinimum(urlMin)
    setMaximum(urlMax)
    setPriceError("")
  }, [urlMin, urlMax, urlCategory, resetKey])
  const reset = () => {
    cancelPriceTimer()
    submitted.current = null
    draft.current = { min: "", max: "", badMin: false, badMax: false }
    setMinimum("")
    setMaximum("")
    setPriceError("")
    resetCatalog()
  }
  const childrenOf = (parent: string | null) => nodes.filter((node) => node.parent_id === parent)
  const selectedAncestors = new Set<string>()
  let selected = nodes.find((node) => node.id === state.category)
  while (selected && !selectedAncestors.has(selected.id)) {
    selectedAncestors.add(selected.id)
    const parentId = selected.parent_id
    selected = nodes.find((node) => node.id === parentId)
  }
  const categoryButton = (node: CatalogNode, all = false) => <button type="button" className={`texno-catalog-node ${state.category === node.id ? "is-selected" : ""} ${node.id === "sale" ? "is-sale" : ""}`} onClick={() => navigate(node.id)} aria-pressed={state.category === node.id}>
    {node.id === "sale" && <span className="texno-sale-mark" aria-hidden="true">%</span>}<span>{all ? `Все ${node.label}` : node.label}</span>
  </button>
  const renderBranch = (parent: string | null, depth = 0): React.ReactNode => {
    if (depth > 8) return null
    return <ul className={depth === 0 ? "texno-catalog-tree" : "texno-catalog-children"}>
      {childrenOf(parent).map((node) => {
        const hasChildren = childrenOf(node.id).length > 0
        return <li key={node.id}>
          {hasChildren ? <CatalogAccordion className="texno-catalog-group" defaultOpen={selectedAncestors.has(node.id)} label={<><span className={selectedAncestors.has(node.id) ? "texno-category-active" : undefined}>{node.label}</span><span className="texno-chevron" /></>}>
            {categoryButton(node, true)}{renderBranch(node.id, depth + 1)}
          </CatalogAccordion> : categoryButton(node)}
        </li>
      })}
    </ul>
  }

  const applyPrice = () => {
    cancelPriceTimer()
    const expectedContext = draftContext.current
    if (expectedContext === null || expectedContext !== getContextVersion()) return
    const { min, max, badMin, badMax } = draft.current
    if (badMin || badMax || (min && (!Number.isFinite(Number(min)) || Number(min) < 0)) || (max && (!Number.isFinite(Number(max)) || Number(max) < 0))) { setPriceError("Укажите корректную цену от нуля."); return }
    if (min && max && Number(min) > Number(max)) { setPriceError("Цена «от» должна быть меньше цены «до»."); return }
    setPriceError("")
    const next = { min: min ? String(Number(min)) : "", max: max ? String(Number(max)) : "" }
    submitted.current = { ...next, category: currentState.current.category, revision: revision.current }
    draft.current = { ...next, badMin: false, badMax: false }
    setMinimum(next.min)
    setMaximum(next.max)
    update(next, expectedContext)
  }
  const editPrice = (bound: "min" | "max", value: string, badInput: boolean) => {
    if (contextLoading || resetKey !== getContextVersion()) return
    cancelPriceTimer()
    revision.current++
    draftContext.current = getContextVersion()
    draft.current = { ...draft.current, [bound]: value, [bound === "min" ? "badMin" : "badMax"]: badInput }
    if (bound === "min") setMinimum(value)
    else setMaximum(value)
    setPriceError("")
    priceTimer.current = setTimeout(applyPrice, 450)
  }
  const movePrice = ([min, max]: number[]) => {
    cancelPriceTimer()
    if (contextLoading || draftContext.current === null || draftContext.current !== getContextVersion()) return false
    revision.current++
    draft.current = { min: String(min), max: String(max), badMin: false, badMax: false }
    setMinimum(String(min))
    setMaximum(String(max))
    setPriceError("")
    return true
  }
  const symbol = config ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: config.currency, maximumFractionDigits: 0 }).formatToParts(0).find((part) => part.type === "currency")?.value : ""
  const hasFilters = Boolean(state.q || state.category || state.min || state.max || state.options.length || state.sale)

  return <><CatalogScrollArea>
    <button type="button" className={`texno-catalog-node texno-catalog-all ${!state.category ? "is-selected" : ""}`} aria-pressed={!state.category} onClick={() => navigate("")}>Все товары</button>
    {nodes.length > 0 && renderBranch(null)}
    <section className="texno-catalog-filters" aria-labelledby="catalog-filters-heading">
      <div className="texno-filter-heading"><h3 id="catalog-filters-heading">Фильтры</h3>{hasFilters && <button type="button" className="texno-text-link" onClick={reset}>Сбросить</button>}</div>
      {error ? <div className="texno-filter-error" role="alert"><p>{error}</p><button type="button" className="texno-text-link" onClick={retry}>Повторить</button></div> : !result && loading ? <div className="texno-filter-skeleton" role="status"><span className="sr-only">Загружаем параметры фильтрации</span><div aria-hidden="true">{[0, 1, 2].map((item) => <div key={item}><span className="texno-skeleton-part" /><div className="texno-skeleton-part" /></div>)}</div></div> : null}
      {result && <>
        <CatalogAccordion className="texno-filter-group" defaultOpen label={<>Цена, {symbol}<span className="texno-chevron" /></>}>
          <form className="texno-catalog-price" noValidate onSubmit={(event) => { event.preventDefault(); applyPrice() }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyPrice() } }}>
            {result.maxPrice > result.minPrice && <Slider.Root className="texno-catalog-range" disabled={contextLoading} min={result.minPrice} max={result.maxPrice} step={1}
              value={[Math.max(result.minPrice, Math.min(result.maxPrice, Number(minimum || result.minPrice))), Math.max(result.minPrice, Math.min(result.maxPrice, Number(maximum || result.maxPrice)))]}
              onValueChange={movePrice}
              onValueCommit={(values) => { if (movePrice(values)) applyPrice() }}
              onKeyDownCapture={() => { if (!contextLoading && resetKey === getContextVersion()) draftContext.current = getContextVersion() }}
              onPointerDown={(event) => {
                if (contextLoading || resetKey !== getContextVersion()) { event.preventDefault(); return }
                draftContext.current = getContextVersion()
                cancelPriceTimer()
                const target = event.target
                if (!(target instanceof Element) || !target.isConnected) { event.preventDefault(); return }
                try {
                  // Radix captures event.target internally. Preflight the same
                  // target so an expired pointer cannot reach its unguarded call.
                  target.setPointerCapture(event.pointerId)
                  sliderPointer.current = { target, id: event.pointerId }
                } catch (error) {
                  if (!stalePointer(error)) throw error
                  sliderPointer.current = null
                  event.preventDefault()
                }
              }}
              onPointerUp={() => { queueMicrotask(() => { sliderPointer.current = null }) }}
              onLostPointerCapture={() => { sliderPointer.current = null }}
              onPointerCancel={() => { releaseSliderPointer(sliderPointer.current); sliderPointer.current = null }}>
              <Slider.Track className="texno-catalog-range-track"><Slider.Range className="texno-catalog-range-selected" /></Slider.Track>
              <Slider.Thumb className="texno-catalog-range-thumb" aria-label="Минимальная цена" /><Slider.Thumb className="texno-catalog-range-thumb" aria-label="Максимальная цена" />
            </Slider.Root>}
            <div className="texno-price-inputs">
              <label><span>От</span><input type="number" disabled={contextLoading} inputMode="decimal" min="0" step="any" value={minimum} placeholder={String(result.minPrice)} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? priceErrorId : undefined} onChange={(event) => editPrice("min", event.target.value, event.target.validity.badInput)} /></label>
              <span aria-hidden="true">—</span>
              <label><span>До</span><input type="number" disabled={contextLoading} inputMode="decimal" min="0" step="any" value={maximum} placeholder={String(result.maxPrice)} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? priceErrorId : undefined} onChange={(event) => editPrice("max", event.target.value, event.target.validity.badInput)} /></label>
            </div>
            {priceError && <p id={priceErrorId} className="texno-filter-error" role="alert">{priceError}</p>}
          </form>
        </CatalogAccordion>
        {result.optionGroups.map((group) => <CatalogAccordion key={group.code ?? group.key} className="texno-filter-group" defaultOpen label={<>{group.label}<span className="texno-chevron" /></>}>
          {group.control === "range" ? <CatalogRangeFilter key={`${state.category}:${group.key}:${state.options.filter((option) => group.values.some((value) => value.value === option)).join("|")}`} group={group} selected={state.options} disabled={contextLoading} onChange={(values) => update({ options: [...state.options.filter((option) => !group.values.some((value) => value.value === option)), ...values] }, resetKey)} /> : <div className={`texno-catalog-options ${group.control === "swatch" || group.role === "color" || isColorAttribute(group.key) ? "texno-catalog-swatches" : ""}`} role="group" aria-label={group.label} inert={contextLoading} aria-busy={contextLoading}>
            {group.values.map((value) => {
              const selected = state.options.includes(value.value)
              const toggle = () => { if (!contextLoading) update({ options: selected ? state.options.filter((option) => option !== value.value) : [...state.options, value.value] }, resetKey) }
              return group.control === "swatch" || group.role === "color" || isColorAttribute(group.key)
                ? <ColorSwatchButton key={value.value} value={value.label} swatches={group.colorSwatches} selected={selected} onClick={toggle} />
                : <button type="button" key={value.value} className="texno-catalog-option" aria-pressed={selected} onClick={toggle}>{value.label}</button>
            })}
          </div>}
        </CatalogAccordion>)}
      </>}
    </section>
  </CatalogScrollArea>{onSelect && <div className="texno-catalog-show"><StoreButton fill="blue" onClick={onSelect}>Показать товары{result && !loading ? ` · ${result.total}` : ""}</StoreButton></div>}</>
}
