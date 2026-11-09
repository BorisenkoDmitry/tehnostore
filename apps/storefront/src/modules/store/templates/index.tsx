"use client"

import { useEffect, useRef, useState } from "react"
import useDebounce from "@lib/hooks/use-debounce"
import ProductGrid from "@modules/home/components/product-grid"
import RichText from "@modules/common/components/rich-text"
import type { ProductDescriptionNode } from "@lib/data/catalog-product"
import StoreButton from "@modules/common/components/store-button"
import { useCatalog } from "@modules/layout/components/storefront-shell"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"
import { useCatalogData } from "@modules/store/components/catalog-provider"
import CatalogSort from "@modules/store/components/catalog-sort"
import CatalogSkeleton from "@modules/store/components/catalog-skeleton"
import { CATALOG_CONTEXT_EVENT } from "@modules/store/lib/catalog-data"

export default function StoreTemplate({ categoryContent = {}, initialCategory = "" }: { categoryContent?: Record<string, { name: string; text?: string; content?: ProductDescriptionNode[] }>; initialCategory?: string }) {
  const { state, result, config, loading, error, resetKey, update, getContextVersion, reset, retry } = useCatalogData()
  const { openCatalog, closeCatalog, catalogOpen } = useCatalog()
  const [query, setQuery] = useState(state.q)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const category = categoryContent[hydrated ? state.category : initialCategory]
  const revision = useRef(0)
  const composing = useRef(false)
  const submitted = useRef<{ value: string; revision: number } | null>(null)
  const observedReset = useRef(resetKey)
  const { run: debounceSearch, cancel: cancelSearch, flush: searchNow } = useDebounce(({ value, context }: { value: string; context: number }) => {
    if (context !== getContextVersion()) return
    submitted.current = { value: value.trim(), revision: revision.current }
    update({ q: value }, context)
  }, 300)
  useEffect(() => {
    const resetChanged = observedReset.current !== resetKey
    observedReset.current = resetKey
    const own = submitted.current
    submitted.current = null
    if (!resetChanged && own?.value === state.q && own.revision < revision.current) return
    cancelSearch()
    setQuery(state.q)
  }, [state.q, resetKey, cancelSearch])
  useEffect(() => {
    const syncHistory = () => {
      cancelSearch()
      submitted.current = null
      revision.current++
      composing.current = false
      setQuery(new URLSearchParams(window.location.search).get("q") ?? "")
    }
    window.addEventListener(CATALOG_CONTEXT_EVENT, syncHistory)
    return () => window.removeEventListener(CATALOG_CONTEXT_EVENT, syncHistory)
  }, [cancelSearch])
  const filtered = Boolean(state.q || state.category || state.min || state.max || state.options.length || state.sale)
  const selectedCategory = config?.categories.find((category) => category.handle === state.category)?.name
  const tags = [
    ...(state.category ? [{ label: selectedCategory || (state.category === "sale" ? "Акции и скидки" : "Категория"), remove: () => update({ category: "", ...(state.category === "sale" ? { sale: false } : {}) }) }] : []),
    ...state.options.map((option) => ({ label: option.replace(":", ": "), remove: () => update({ options: state.options.filter((value) => value !== option) }) })),
    ...(state.min || state.max ? [{ label: `${state.min ? `от ${state.min}` : ""}${state.min && state.max ? " " : ""}${state.max ? `до ${state.max}` : ""} ${config?.currency.toUpperCase() ?? ""}`, remove: () => update({ min: "", max: "" }) }] : []),
    ...(state.sale && state.category !== "sale" ? [{ label: "Со скидкой", remove: () => update({ sale: false }) }] : []),
  ]
  return <section className="texno-store texno-section" aria-labelledby="store-title">
    <div className="texno-container">
      <div className="texno-section-heading"><h1 id="store-title">{category?.name || "Каталог"}</h1><span className="texno-store-count" role="status" aria-live="polite">{loading ? "Обновляем товары…" : result ? `Найдено: ${result.total}` : ""}</span></div>
      <div className="texno-store-toolbar">
        <button type="button" className="texno-store-filter-toggle" onClick={catalogOpen ? closeCatalog : openCatalog} aria-expanded={catalogOpen} aria-controls="catalog-panel"><StoreIcon name="catalog" /><span>Категории и фильтры</span></button>
        <form className="texno-store-search" role="search" onSubmit={(event) => { event.preventDefault(); if (!composing.current) searchNow({ value: query, context: getContextVersion() }) }}>
          <label className="sr-only" htmlFor="catalog-search">Поиск по каталогу</label>
          <input id="catalog-search" type="search" name="q" placeholder="Найти товар" value={query}
            onCompositionStart={() => { composing.current = true; cancelSearch() }}
            onCompositionEnd={(event) => { if (!composing.current) return; composing.current = false; debounceSearch({ value: event.currentTarget.value, context: getContextVersion() }) }}
            onChange={(event) => {
              const value = event.target.value
              revision.current++
              setQuery(value)
              if (!composing.current) { if (value) debounceSearch({ value, context: getContextVersion() }); else searchNow({ value: "", context: getContextVersion() }) }
            }} />
          <button type="submit" aria-label="Найти товар" title="Найти товар"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button>
        </form>
        <CatalogSort value={state.sort} onChange={(sort) => update({ sort })} />
      </div>
      {(filtered || tags.length > 0) && <div className="texno-store-active" aria-label="Выбранные фильтры">
        {state.q && <button type="button" className="texno-store-chip" onClick={() => update({ q: "" })}>Поиск: {state.q}<StoreIcon name="close" /></button>}
        {tags.map((tag) => <button type="button" className="texno-store-chip" key={tag.label} onClick={tag.remove}>{tag.label}<StoreIcon name="close" /></button>)}
        <button type="button" className="texno-text-link" onClick={reset}>Сбросить всё</button>
      </div>}
      <div className="texno-store-results" aria-busy={loading}>
        {error ? <div className="texno-store-empty" role="alert"><h2>Не удалось загрузить товары</h2><p>{error}</p><StoreButton fill="blue" onClick={retry}>Попробовать снова</StoreButton></div>
          : !result ? <CatalogSkeleton />
          : !result.products.length ? <div className="texno-store-empty"><h2>Товары не найдены</h2><p>Попробуйте другую категорию или измените фильтры.</p><StoreButton fill="blue" onClick={reset}>Показать все товары</StoreButton></div>
          : <ProductGrid products={result.products.map((product) => ({
              id: product.id, title: product.title, image: product.image,
              price: product.price, oldPrice: product.oldPrice, currency: product.currency,
              category: product.categoryKeys[0] || "", popular: true, sourceUrl: "",
              href: product.preview ? undefined : product.href,
            }))} previewNotice="Это пример товара для знакомства с каталогом. Цены и характеристики показаны для предварительного просмотра. Покупка этого примера недоступна." />}
      </div>
      {result && result.pages > 1 && <nav className="texno-store-pagination" aria-label="Страницы каталога">
        <button type="button" disabled={state.page <= 1} onClick={() => update({ page: state.page - 1 })}>Назад</button><span>{state.page} / {result.pages}</span><button type="button" disabled={state.page >= result.pages} onClick={() => update({ page: state.page + 1 })}>Далее</button>
      </nav>}
      {!!(category?.content?.length || category?.text) && state.page === 1 && !state.q && !state.options.length && !state.min && !state.max && <div className="texno-rich-content texno-category-text">
        {category?.content?.length ? <RichText nodes={category.content} /> : <p style={{ whiteSpace: "pre-line" }}>{category?.text}</p>}
      </div>}
    </div>
  </section>
}
