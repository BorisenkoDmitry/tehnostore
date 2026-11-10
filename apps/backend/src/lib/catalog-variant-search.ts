import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import { canonicalCatalogToken } from "../search/helpers/catalog-filter-values"
import { libraryFacetNames, variationFacets, type FacetVariant } from "../search/helpers/variation-facets"

export function variantSearchProjection(variants: FacetVariant[], metadata?: Record<string, unknown> | null, names?: ReturnType<typeof libraryFacetNames>) {
  const rows = variants.map((variant) => {
    const { display, lookup } = variationFacets(variant, metadata, names)
    return [...new Set([...display, ...lookup].map(canonicalCatalogToken))]
  })
  return { fields: [...new Set(rows.flatMap((row) => row.map((token) => token.slice(0, token.indexOf(":")))))], rows }
}

export async function refreshCatalogVariantSearch(container: MedusaContainer, ids: string[]) {
  if (!ids.length) return
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const [{ data }, definitions] = await Promise.all([
    container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "product", fields: ["id", "metadata", "variants.id", "variants.metadata", "variants.options.option.title", "variants.options.value", "variants.catalog_variant.attributes"],
      filters: { id: ids }, pagination: { take: ids.length },
    }),
    service.listCatalogDefinitions({}, { take: 1000 }),
  ])
  const names = libraryFacetNames(definitions)
  const products = data as unknown as { id: string; metadata?: Record<string, unknown>; variants?: FacetVariant[] }[]
  const projections = products.filter((product) => (product.variants?.length ?? 0) > 1).map((product) => ({ id: product.id, ...variantSearchProjection(product.variants ?? [], product.metadata, names) }))
  const retained = new Set(projections.map(({ id }) => id))
  const removed = ids.filter((id) => !retained.has(id))
  if (removed.length) await service.deleteCatalogVariantSearches(removed)
  if (projections.length) await service.replaceVariantSearches(projections)
}
