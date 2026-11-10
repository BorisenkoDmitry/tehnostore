import type { CatalogNode } from "@lib/data/navigation"
import type { CatalogConfig } from "@modules/store/components/catalog-provider"
import { adaptMedusaHit, canonicalCatalogToken, catalogOptionGroups, CATALOG_PAGE_SIZE, splitCatalogOption, type CatalogResult, type CatalogState } from "./catalog-data"

export type CatalogSearchResult = {
  hits: Record<string, unknown>[]; nbHits: number; nbPages: number; page: number
  facets?: Record<string, Record<string, number>>
  facets_stats?: Record<string, { min: number; max: number }>
}
export type InitialCatalog = { search: string; result: CatalogResult }
const hierarchyOptionKeys = new Set(["тип товара", "бренд", "модель", "модель устройства", "тип аксессуара", "тип"])

export function categoryHandles(category: string, nodes: CatalogNode[], config: CatalogConfig) {
  if (!category || category === "sale") return []
  const handles = new Set([config.categories.find((item) => item.id === category)?.handle ?? category])
  if (!config.categories.some((item) => item.handle === category)) {
    const menuChildren = new Map<string, CatalogNode[]>()
    for (const node of nodes) if (node.parent_id) menuChildren.set(node.parent_id, [...(menuChildren.get(node.parent_id) ?? []), node])
    const menuIds = new Set([category])
    menuIds.forEach((id) => { for (const child of menuChildren.get(id) ?? []) menuIds.add(child.id) })
    for (const node of nodes) if (menuIds.has(node.id)) {
      const handle = node.href.match(/^\/(?:collection|collections|categories)\/([^?#/]+)\/?/)?.[1]
      if (handle) handles.add(handle)
    }
  }
  const ids = new Set(config.categories.filter((item) => handles.has(item.handle)).map((item) => item.id))
  for (;;) {
    let changed = false
    for (const item of config.categories) if (!ids.has(item.id) && ((item.parent_id && ids.has(item.parent_id)) || item.additional_parent_ids?.some((id) => ids.has(id)))) { ids.add(item.id); changed = true }
    if (!changed) break
  }
  return ids.size ? config.categories.filter((item) => ids.has(item.id)).map((item) => item.handle) : ["__unmapped_catalog_category__"]
}

export function catalogSearchQueries(state: CatalogState, nodes: CatalogNode[], config: CatalogConfig) {
  const currency = config.currency.toLowerCase()
  const saleOnly = state.sale || state.category === "sale"
  const price = `${saleOnly ? "min_sale_price" : "min_price"}_${currency}`
  const facetFilters: (string | string[])[] = [[`catalog_scope:${config.scope}`]]
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
  for (const [key, filters] of Array.from(options.entries())) if (hierarchyOptionKeys.has(key)) availableFilters.push(filters)
  const numericFilters = [...(state.min ? [`${price}>=${state.min}`] : []), ...(state.max ? [`${price}<=${state.max}`] : [])]
  const sorts: Record<string, string> = { price_asc: `${price}:asc`, price_desc: `${price}:desc`, title_asc: "title:asc", title_desc: "title:desc" }
  const indexName = sorts[state.sort] ? `product/sort/${sorts[state.sort]}` : "product"
  const attributesToRetrieve = ["id", "title", "handle", "thumbnail", "category", "option_values", "is_catalog_example", `min_price_${currency}`, `original_price_${currency}`, `min_sale_price_${currency}`, `original_sale_price_${currency}`]
  return [
    { indexName, params: { query: state.q, hitsPerPage: CATALOG_PAGE_SIZE, page: state.page - 1, facetFilters, numericFilters, attributesToRetrieve } },
    { indexName: "product", params: { query: state.q, hitsPerPage: 0, page: 0, facetFilters: availableFilters, facets: ["option_values", "category_handles", price], maxValuesPerFacet: 5000, attributesToRetrieve: ["id"] } },
  ]
}

export function catalogSearchResponse(results: CatalogSearchResult[], state: CatalogState, nodes: CatalogNode[], config: CatalogConfig) {
  const [hits, available] = results
  const currency = config.currency.toLowerCase()
  const saleOnly = state.sale || state.category === "sale"
  const price = `${saleOnly ? "min_sale_price" : "min_price"}_${currency}`
  const selectedNode = nodes.find((node) => node.id === state.category)
  const selectedHandle = selectedNode?.href.match(/^\/(?:collection|collections|categories)\/([^?#/]+)/)?.[1]
  const selectedCategory = config.categories.find((item) => item.id === state.category || item.handle === state.category || item.handle === selectedHandle)
  const optionGroups = catalogOptionGroups(Object.keys(available.facets?.option_values ?? {}), config.definitions, selectedCategory?.filter_codes, selectedCategory?.filter_disabled_codes)
  const representatives = new Map(optionGroups.flatMap((group) => group.values.map((value) => [canonicalCatalogToken(value.value), value.value] as const)))
  const options = state.options.map((value) => representatives.get(canonicalCatalogToken(value)) ?? value)
  const pages = Math.max(1, hits.nbPages || Math.ceil(hits.nbHits / CATALOG_PAGE_SIZE))
  return {
    state: { ...state, options, page: Math.min(state.page, pages) },
    result: { products: hits.hits.map((hit) => {
      const product = adaptMedusaHit(hit, currency, saleOnly)
      // The adapter builds this map with a null prototype for safe arbitrary
      // attribute names. Object spread preserves its own keys as a plain DTO
      // that React can serialize across the server/client boundary.
      return { ...product, options: { ...product.options } }
    }), total: hits.nbHits, page: state.page, pages, optionGroups, minPrice: available.facets_stats?.[price]?.min ?? 0, maxPrice: available.facets_stats?.[price]?.max ?? 0, currency } satisfies CatalogResult,
  }
}
