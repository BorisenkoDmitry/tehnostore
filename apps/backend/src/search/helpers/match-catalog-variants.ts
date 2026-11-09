import type { MedusaNextFunction, MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http"
import type { SearchTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
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
// conjunctive catalog filters, narrow its already-filtered candidate IDs by
// the real variant combinations, before the core search paginates the results.
export async function matchCatalogVariantFilters(req: MedusaStoreRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const payload = req.validatedBody as Query | { queries: Query[] } | undefined
  if (!payload) return next()
  const batch = "queries" in payload
  const requests = batch ? payload.queries : [payload]
  const search = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const channelIds = req.publishable_key_context?.sales_channel_ids
  if (!channelIds?.length) return next()
  const transformed: Query[] = []
  let names: ReturnType<typeof libraryFacetNames> | undefined
  for (const request of requests) {
    const groups = selectedGroups(request.filters)
    if (request.entity !== "product" || new Set(groups.map((group) => fieldOf(group[0]))).size < 2) {
      transformed.push(request)
      continue
    }
    if (!names) {
      const { data: definitions } = await search.graph({ entity: "catalog_definition", fields: ["code", "label", "aliases"], pagination: { take: 1000 } })
      names = libraryFacetNames(definitions)
    }
    const { q, ...original } = request.filters ?? {}
    const accepted: string[] = []
    const excluded: string[] = []
    const take = 100
    for (let skip = 0; ; skip += take) {
      const { search_result } = await search.search({
        entity: "product",
        fields: ["id"],
        filters: { ...(q === undefined ? {} : { q }), $and: [{ status: "published", sales_channel_ids: channelIds }, original] } as Filter,
        pagination: { skip, take, order: { title: "ASC" } },
        search_options: {
          ...request.search_options, facets: undefined, distinct: undefined, highlight: false, count: "none",
        },
      })
      const ids = search_result.hits.map((row) => row.id)
      if (ids.length) {
        const { data } = await search.graph({
          entity: "product",
          fields: ["id", "metadata", "variants.id", "variants.metadata", "variants.options.option.title", "variants.options.value", "variants.catalog_variant.attributes"],
          filters: { id: ids, status: "published" },
          pagination: { take: ids.length },
        })
        const matches = new Set((data as unknown as { id: string; variants: FacetVariant[]; metadata?: Record<string, unknown> | null }[])
          .filter((row) => matchesCatalogVariant(row.variants ?? [], groups, row.metadata, names)).map((row) => row.id))
        for (const id of ids) (matches.has(id) ? accepted : excluded).push(id)
      }
      if (ids.length < take) break
    }
    if (!excluded.length) transformed.push(request)
    else {
      const id = accepted.length === 0 ? "__catalog_no_matching_variant__"
        : accepted.length <= excluded.length ? { $in: accepted } : { $nin: excluded }
      transformed.push({ ...request, filters: { ...(q === undefined ? {} : { q }), $and: [original, { id }] } as Filter })
    }
  }
  req.validatedBody = batch ? { queries: transformed } : transformed[0]
  return next()
}
