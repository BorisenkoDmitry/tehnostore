"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { hashKey, QueryClient } from "@tanstack/react-query"
import { sdk } from "@lib/config"
import { createSearchClient } from "@lib/search-client"
import { getBrowserLocale } from "@lib/util/get-locale-header"
import type { CatalogNode } from "@lib/data/navigation"
import type { ProductDescriptionNode } from "@lib/data/catalog-product"
import { catalogSearchKey, catalogSearchQueries, catalogSearchResponse, type CatalogSearchResult, type InitialCatalog } from "@modules/store/lib/catalog-search"
import {

  CATALOG_CONTEXT_EVENT, navigateCatalogState, parseCatalogState, serializeCatalogState,
  type CatalogResult, type CatalogState,
  type CatalogDefinition,
} from "@modules/store/lib/catalog-data"

export type CatalogConfig = {
  currency: string
  scope: string
  definitions?: CatalogDefinition[]
  categories: { id: string; handle: string; name: string; parent_id: string | null; additional_parent_ids?: string[]; seo?: { title?: string; description?: string; text?: string; content?: ProductDescriptionNode[] }; filter_codes?: string[] | null; filter_disabled_codes?: string[]; position?: number }[]
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
const CONFIG_KEY = ["catalog", "config"] as const
const PRODUCT_STALE_TIME = 15_000
const FACET_STALE_TIME = 60_000

export { categoryHandles } from "@modules/store/lib/catalog-search"

export default function CatalogProvider({ nodes, initialConfig, initialCatalog, children }: { nodes: CatalogNode[]; initialConfig: CatalogConfig | null; initialCatalog?: InitialCatalog | null; children: React.ReactNode }) {
  const pathname = usePathname()
  const search = useSyncExternalStore(subscribe, getSearch, () => initialCatalog?.search ?? getServerSearch())
  const active = /\/store\/?$/.test(pathname)
  const state = useMemo(() => parseCatalogState(new URLSearchParams(search)), [search])
  const locale = typeof document === "undefined" ? initialCatalog?.locale ?? null : getBrowserLocale()
  const [queryClient] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: {
      retry: false,
      gcTime: typeof window === "undefined" ? Infinity : 5 * 60_000,
    } } })
    const updatedAt = initialCatalog?.fetchedAt ?? Date.now()
    if (initialConfig) client.setQueryData(CONFIG_KEY, initialConfig, { updatedAt })
    if (initialCatalog && initialConfig) {
      const initialState = parseCatalogState(new URLSearchParams(initialCatalog.search))
      catalogSearchQueries(initialState, nodes, initialConfig).forEach((request, index) => {
        client.setQueryData(catalogSearchKey(request, initialCatalog.locale), initialCatalog.responses[index], { updatedAt })
      })
    }
    return client
  })
  const [config, setConfig] = useState<CatalogConfig | null>(initialConfig)
  const [result, setResult] = useState<CatalogResult | null>(() => initialCatalog && initialConfig
    ? catalogSearchResponse(initialCatalog.responses, state, nodes, initialConfig).result : null)
  const [loading, setLoading] = useState(active && !initialCatalog)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [resetKey, setResetKey] = useState(0)
  const [resultContext, setResultContext] = useState(initialCatalog ? 0 : -1)
  const initialSearch = useRef(initialCatalog?.search)
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
    // Recheck stale prices/configuration when returning to the catalog tab.
    const refresh = () => { if (document.visibilityState === "visible") setAttempt((value) => value + 1) }
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [active])

  useEffect(() => {
    if (!active) return
    if (initialConfig && attempt === 0) return
    let disposed = false
    setLoading(true)
    setError(null)
    queryClient.fetchQuery({ queryKey: CONFIG_KEY, staleTime: FACET_STALE_TIME,
      queryFn: () => sdk.client.fetch<CatalogConfig>("/store/catalog-config", { cache: "no-store" }),
    })
      .then((data) => { if (!disposed) setConfig(data) })
      .catch(() => {
        if (!disposed) { setError("Не удалось загрузить каталог. Попробуйте ещё раз."); setLoading(false) }
      })
    return () => { disposed = true }
  }, [active, initialConfig, attempt, queryClient])

  useEffect(() => {
    if (!active || !config) return
    if (initialSearch.current !== undefined && initialSearch.current === search && initialCatalog?.locale === locale && attempt === 0 && resetKey === 0) return
    initialSearch.current = undefined
    let disposed = false
    const version = ++requestVersion.current
    const isCurrent = () => !disposed && version === requestVersion.current && window.location.search === search && window.location.pathname === pathname
    setLoading(true)
    setError(null)
    const requests = catalogSearchQueries(state, nodes, config)
    const keys = new Set(requests.map((request) => hashKey(catalogSearchKey(request, locale))))
    // Preserve shared in-flight facets while cancelling obsolete selections.
    void queryClient.cancelQueries({ queryKey: ["catalog", "search"],
      predicate: (query) => query.state.fetchStatus === "fetching" && !keys.has(query.queryHash),
    })
    Promise.all(requests.map((request, index) => queryClient.fetchQuery({
      queryKey: catalogSearchKey(request, locale),
      staleTime: index === 0 ? PRODUCT_STALE_TIME : FACET_STALE_TIME,
      queryFn: async ({ signal }) => {
        const response = await createSearchClient(signal).search([request])
        return response.results[0] as unknown as CatalogSearchResult
      },
    }))).then((responses) => {
      if (!isCurrent()) return
      const mapped = catalogSearchResponse(responses, state, nodes, config)
      if (serializeCatalogState(mapped.state).toString() !== serializeCatalogState(state).toString()) {
        write(mapped.state, true)
        return
      }
      setResult(mapped.result)
      setResultContext(resetKey)
      setLoading(false)
    }).catch(() => {
      if (isCurrent()) { setError("Не удалось получить товары. Попробуйте ещё раз."); setLoading(false) }
    })
    return () => { disposed = true }
  }, [active, config, state, nodes, attempt, write, resetKey, search, pathname, queryClient, locale, initialCatalog?.locale])

  const retry = () => {
    void queryClient.invalidateQueries({ queryKey: ["catalog"] })
    setAttempt((value) => value + 1)
  }
  return <CatalogContext.Provider value={{ state, result, config, loading, contextLoading: resultContext !== resetKey, error, resetKey, update, navigate, resetFilters, getContextVersion, reset, retry }}>{children}</CatalogContext.Provider>
}

export const useCatalogData = () => {
  const context = useContext(CatalogContext)
  if (!context) throw new Error("CatalogProvider is missing")
  return context
}
