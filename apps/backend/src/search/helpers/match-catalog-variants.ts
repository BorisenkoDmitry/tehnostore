import type { MedusaNextFunction, MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http"
import type { SearchTypes } from "@medusajs/framework/types"
import { CATALOG_ATTRIBUTES_MODULE } from "../../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../../modules/catalog-attributes/service"
import { canonicalCatalogToken } from "./catalog-filter-values"
import { libraryFacetNames, variationFacets, type FacetVariant } from "./variation-facets"

type Query = SearchTypes.SearchQuery
type Filter = NonNullable<Query["filters"]>
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
const fieldOf = (token: string) => token.slice(0, token.indexOf(":"))

function selectedGroups(filter: unknown): string[][] {
  const value = record(filter)
  if (!value) return []
  const selection = value.filter_values
  const operator = record(selection)
  const positive = operator ? (Object.keys(operator).length === 1 ? operator.$in ?? operator.$eq : undefined) : selection
  const values = Array.isArray(positive) ? positive : [positive]
  const group = values.every((item): item is string => typeof item === "string" && item.indexOf(":") > 0)
    ? values.map(canonicalCatalogToken) : []
  return [
    ...(group.length && new Set(group.map(fieldOf)).size === 1 ? [group] : []),
    ...(Array.isArray(value.$and) ? value.$and.flatMap(selectedGroups) : []),
  ]
}

export function matchesCatalogVariant(variants: FacetVariant[], groups: string[][], metadata?: Record<string, unknown> | null, names?: ReturnType<typeof libraryFacetNames>) {
  if (!variants.length) return true
  const rows = variants.map((variant) => {
    const { display, lookup } = variationFacets(variant, metadata, names)
    return new Set([...display, ...lookup].map(canonicalCatalogToken))
  })
  const variantFields = new Set(rows.flatMap((row) => [...row].map(fieldOf)))
  const relevant = groups.filter((group) => variantFields.has(fieldOf(group[0])))
  if (relevant.length < 2) return true
  return rows.some((row) => relevant.every((group) => group.some((token) => row.has(token))))
}

// Keep the core search route, visibility checks, facet counts and sorting. For
// conjunctive filters, exclude impossible combinations using a private read
// projection. The core endpoint retains channel/status scoping and pagination.
export async function matchCatalogVariantFilters(req: MedusaStoreRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const payload = req.validatedBody as Query | { queries: Query[] } | undefined
  if (!payload) return next()
  const batch = "queries" in payload
  const requests = batch ? payload.queries : [payload]
  const service = req.scope.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const channelIds = req.publishable_key_context?.sales_channel_ids
  if (!channelIds?.length) return next()
  const transformed: Query[] = []
  const matches = new Map<string, Promise<string[]>>()
  for (const request of requests) {
    const groups = selectedGroups(request.filters)
    if (request.entity !== "product" || new Set(groups.map((group) => fieldOf(group[0]))).size < 2) {
      transformed.push(request)
      continue
    }
    const { q, ...original } = request.filters ?? {}
    const key = JSON.stringify(groups)
    if (!matches.has(key)) matches.set(key, service.findVariantMismatches(groups))
    const excluded = await matches.get(key)!
    if (!excluded.length) transformed.push(request)
    else {
      transformed.push({ ...request, filters: { ...(q === undefined ? {} : { q }), $and: [original, { id: { $nin: excluded } }] } as Filter })
    }
  }
  req.validatedBody = batch ? { queries: transformed } : transformed[0]
  return next()
}
