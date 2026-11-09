"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { sdk } from "@lib/config"
import { searchClient, PRODUCT_INDEX_NAME } from "@lib/search-client"
import type { CatalogNode } from "@lib/data/navigation"
import type { ProductDescriptionNode } from "@lib/data/catalog-product"
import {
  adaptMedusaHit, canonicalCatalogToken, catalogOptionGroups, CATALOG_PAGE_SIZE,
  CATALOG_CONTEXT_EVENT, navigateCatalogState, parseCatalogState, serializeCatalogState, splitCatalogOption,
  type CatalogResult, type CatalogState,
  type CatalogDefinition,
} from "@modules/store/lib/catalog-data"

export type CatalogConfig = {
  currency: string
  scope: string
  definitions?: CatalogDefinition[]
  categories: { id: string; handle: string; name: string; parent_id: string | null; additional_parent_ids?: string[]; seo?: { title?: string; description?: string; text?: string; content?: ProductDescriptionNode[] }; filter_codes?: string[] | null; filter_disabled_codes?: string[]; position?: number }[]
}

type SearchResult = {
  hits: Record<string, unknown>[]
  nbHits: number
  nbPages: number
  page: number
  facets?: Record<string, Record<string, number>>
  facets_stats?: Record<string, { min: number; max: number }>
}

type CatalogContextValue = {
  state: CatalogState
  result: CatalogResult | null
  config: CatalogConfig | null
  loading: boolean
  contextLoading: boolean
  error: string | null
  resetKey: number
  update: (patch: Partial<CatalogState>, expectedContext?: number) => void
  navigate: (category: string) => void
  resetFilters: () => void
  getContextVersion: () => number
  reset: () => void
  retry: () => void
}

const CatalogContext = createContext<CatalogContextValue | null>(null)
const hierarchyOptionKeys = new Set(["тип товара", "бренд", "модель", "модель устройства", "тип аксессуара", "тип"])
const URL_EVENT = "texno-catalog-url"
const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify)
  window.addEventListener(URL_EVENT, notify)
  return () => {
    window.removeEventListener("popstate", notify)
    window.removeEventListener(URL_EVENT, notify)
  }
}
const getSearch = () => window.location.search
const getServerSearch = () => ""

/** Resolve saved menu URLs to actual Medusa category handles, including descendants. */
export function categoryHandles(category: string, nodes: CatalogNode[], config: CatalogConfig) {
  if (!category || category === "sale") return []
  const handles = new Set([category])
  if (!config.categories.some((item) => item.handle === category)) {
    const menuChildren = new Map<string, CatalogNode[]>()
    for (const node of nodes) if (node.parent_id) {
      const children = menuChildren.get(node.parent_id) ?? []
      children.push(node)
      menuChildren.set(node.parent_id, children)
    }
    const menuIds = new Set([category])
    menuIds.forEach((id) => {
      for (const child of menuChildren.get(id) ?? []) menuIds.add(child.id)
    })
    for (const node of nodes) if (menuIds.has(node.id)) {
      const handle = node.href.match(/^\/(?:collection|collections|categories)\/([^?#/]+)\/?/)?.[1]
      if (handle) handles.add(handle)
    }
  }
  const ids = new Set(config.categories.filter((item) => handles.has(item.handle)).map((item) => item.id))
  for (;;) {
    let changed = false
    for (const item of config.categories) {
      if (!ids.has(item.id) && ((item.parent_id && ids.has(item.parent_id)) || item.additional_parent_ids?.some((id) => ids.has(id)))) {
        ids.add(item.id)
        changed = true
      }
    }
    if (!changed) break
  }
  return ids.size ? config.categories.filter((item) => ids.has(item.id)).map((item) => item.handle) : ["__unmapped_catalog_category__"]
}

export default function CatalogProvider({ nodes, initialConfig, children }: { nodes: CatalogNode[]; initialConfig: CatalogConfig | null; children: React.ReactNode }) {
  const pathname = usePathname()
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch)
  const active = /\/store\/?$/.test(pathname)
  const state = useMemo(() => parseCatalogState(new URLSearchParams(search)), [search])
  const [config, setConfig] = useState<CatalogConfig | null>(initialConfig)
  const [result, setResult] = useState<CatalogResult | null>(null)
  const [loading, setLoading] = useState(active)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [resetKey, setResetKey] = useState(0)
  const [resultContext, setResultContext] = useState(-1)
  const contextVersion = useRef(0)
  const requestVersion = useRef(0)
  const getContextVersion = useCallback(() => contextVersion.current, [])

  const write = useCallback((next: CatalogState, replace = false) => {
    const current = new URLSearchParams(window.location.search)
    const query = serializeCatalogState(next, current).toString()
    if (query === current.toString()) return
    requestVersion.current++
    setLoading(true)
    window.history[replace ? "replaceState" : "pushState"](null, "", `${window.location.pathname}${query ? `?${query}` : ""}`)
    window.dispatchEvent(new Event(URL_EVENT))
  }, [])
  const changeContext = useCallback((next: CatalogState) => {
    contextVersion.current++
    requestVersion.current++
    write(next)
    setResetKey((value) => value + 1)
    window.dispatchEvent(new Event(CATALOG_CONTEXT_EVENT))
  }, [write])
  const navigate = useCallback((category: string) => {
    changeContext(navigateCatalogState(parseCatalogState(new URLSearchParams(window.location.search)), category))
  }, [changeContext])
  const update = useCallback((patch: Partial<CatalogState>, expectedContext?: number) => {
    if (expectedContext !== undefined && expectedContext !== contextVersion.current) return
    if (patch.category !== undefined) { navigate(patch.category); return }
    // Read the latest URL, so rapid filter changes cannot overwrite each other.
    write({ ...parseCatalogState(new URLSearchParams(window.location.search)), page: 1, ...patch })
  }, [write, navigate])
  const reset = useCallback(() => navigate(""), [navigate])
  const resetFilters = useCallback(() => {
    const current = parseCatalogState(new URLSearchParams(window.location.search))
    changeContext(navigateCatalogState(current, current.category))
  }, [changeContext])

  useEffect(() => {
    const restoreHistory = () => {
      contextVersion.current++
      requestVersion.current++
      setResetKey((value) => value + 1)
      window.dispatchEvent(new Event(CATALOG_CONTEXT_EVENT))
    }
    window.addEventListener("popstate", restoreHistory)
    return () => window.removeEventListener("popstate", restoreHistory)
  }, [])

  useEffect(() => {
    if (!active) return
    if (initialConfig && attempt === 0) return
    let disposed = false
    setLoading(true)
    setError(null)
    sdk.client.fetch<CatalogConfig>("/store/catalog-config", { cache: "no-store" })
      .then((data) => { if (!disposed) setConfig(data) })
      .catch(() => {
        if (!disposed) { setError("Не удалось загрузить каталог. Попробуйте ещё раз."); setLoading(false) }
      })
    return () => { disposed = true }
  }, [active, initialConfig, attempt])

  useEffect(() => {
    if (!active || !config) return
    let disposed = false
    const version = ++requestVersion.current
    const isCurrent = () => !disposed && version === requestVersion.current && window.location.search === search && window.location.pathname === pathname
    setLoading(true)
    setError(null)
    const currency = config.currency.toLowerCase()
    const saleOnly = state.sale || state.category === "sale"
    const price = `${saleOnly ? "min_sale_price" : "min_price"}_${currency}`
    const scope = [`catalog_scope:${config.scope}`]
    const facetFilters: (string | string[])[] = [scope]
    const handles = categoryHandles(state.category, nodes, config)
    if (handles.length) facetFilters.push(handles.map((handle) => `category_handles:${handle}`))
    if (saleOnly) facetFilters.push([`on_sale_${currency}:true`])
    const availableFilters = [...facetFilters]
    const options = new Map<string, string[]>()
    for (const value of state.options) {
      const option = splitCatalogOption(value)
      if (!option) continue
      const key = canonicalCatalogToken(option.key)
      options.set(key, [...(options.get(key) ?? []), `filter_values:${canonicalCatalogToken(value)}`])
    }
    facetFilters.push(...Array.from(options.values()))
    // Hierarchy selections narrow the characteristics offered by the server.
    // Other attribute choices remain disjunctive, so their alternatives stay visible.
    for (const [key, filters] of Array.from(options.entries())) {
      if (hierarchyOptionKeys.has(key)) availableFilters.push(filters)
    }
    const numericFilters = [
      ...(state.min ? [`${price}>=${state.min}`] : []),
      ...(state.max ? [`${price}<=${state.max}`] : []),
    ]
    const sorts: Record<string, string> = {
      price_asc: `${price}:asc`, price_desc: `${price}:desc`,
      title_asc: "title:asc", title_desc: "title:desc",
    }
    const indexName = sorts[state.sort] ? `${PRODUCT_INDEX_NAME}/sort/${sorts[state.sort]}` : PRODUCT_INDEX_NAME
    // Both requests use the existing Medusa InstantSearch adapter. The second
    // asks for available facets/bounds, without narrowing them to a chosen value.
    // No products are filtered, sorted or paginated in the browser.
    const queries = [
      { indexName, params: { query: state.q, hitsPerPage: CATALOG_PAGE_SIZE, page: state.page - 1, facetFilters, numericFilters } },
      { indexName: PRODUCT_INDEX_NAME, params: { query: state.q, hitsPerPage: 1, page: 0, facetFilters: availableFilters, facets: ["option_values", "category_handles", price], maxValuesPerFacet: 5000 } },
    ]
    searchClient.search(queries).then((response) => {
      if (!isCurrent()) return
      const [hits, available] = response.results as unknown as SearchResult[]
      const selectedNode = nodes.find((node) => node.id === state.category)
      const selectedHandle = selectedNode?.href.match(/^\/(?:collection|collections|categories)\/([^?#/]+)/)?.[1]
      const selectedCategory = config.categories.find((item) => item.id === state.category || item.handle === state.category || item.handle === selectedHandle)
      const optionGroups = catalogOptionGroups(
        Object.keys(available.facets?.option_values ?? {}),
        config.definitions,
        selectedCategory?.filter_codes,
        selectedCategory?.filter_disabled_codes
      )
      const representatives = new Map(optionGroups.flatMap((group) => group.values.map((value) => [canonicalCatalogToken(value.value), value.value] as const)))
      const selectedOptions = state.options.map((value) => representatives.get(canonicalCatalogToken(value)) ?? value)
      if (selectedOptions.some((value, index) => value !== state.options[index])) {
        // Preserve selection styling for saved URLs containing a display alias.
        write({ ...state, options: selectedOptions }, true)
        return
      }
      const pages = Math.max(1, hits.nbPages || Math.ceil(hits.nbHits / CATALOG_PAGE_SIZE))
      if (state.page > pages) {
        write({ ...state, page: pages }, true)
        return
      }
      setResult({
        products: hits.hits.map((hit) => adaptMedusaHit(hit, currency, saleOnly)),
        total: hits.nbHits, page: state.page, pages,
        optionGroups,
        minPrice: available.facets_stats?.[price]?.min ?? 0,
        maxPrice: available.facets_stats?.[price]?.max ?? 0,
        currency,
      })
      setResultContext(resetKey)
      setLoading(false)
    }).catch(() => {
      if (isCurrent()) { setError("Не удалось получить товары. Попробуйте ещё раз."); setLoading(false) }
    })
    return () => { disposed = true }
  }, [active, config, state, nodes, attempt, write, resetKey, search, pathname])

  return <CatalogContext.Provider value={{ state, result, config, loading, contextLoading: resultContext !== resetKey, error, resetKey, update, navigate, resetFilters, getContextVersion, reset, retry: () => setAttempt((value) => value + 1) }}>{children}</CatalogContext.Provider>
}

export const useCatalogData = () => {
  const context = useContext(CatalogContext)
  if (!context) throw new Error("CatalogProvider is missing")
  return context
}
