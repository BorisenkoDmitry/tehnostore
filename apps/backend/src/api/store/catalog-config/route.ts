import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CATALOG_ATTRIBUTES_MODULE } from "../../../modules/catalog-attributes"
import CatalogAttributesModuleService from "../../../modules/catalog-attributes/service"
import { getCatalogProfile } from "../../../lib/catalog-cms"
import { categoryShortcuts, publishedCategoryIds } from "../../../lib/catalog-hierarchy"
import { isLibraryDefinition } from "../../../lib/catalog-variation-library"
import { NAVIGATION_MODULE } from "../../../modules/navigation"
import type NavigationModuleService from "../../../modules/navigation/service"
import { publicCategorySeo } from "../../../lib/product-description"

/** The installation profile references native Medusa commerce configuration. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const profile = await getCatalogProfile(req.scope)
  const definitions = await req.scope.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).listCatalogDefinitions({ enabled: true, public: true }, { take: 1000, order: { position: "ASC", label: "ASC" } })
  const { data } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle", "name", "parent_category_id", "metadata", "is_active", "is_internal"],
    pagination: { take: 1000 },
  })
  const published = publishedCategoryIds(data, profile.scope)
  const [navigation] = await req.scope.resolve<NavigationModuleService>(NAVIGATION_MODULE).listSiteNavigations({ key: "main" })
  const shortcuts = categoryShortcuts(navigation?.items.find(({ kind }) => kind === "catalog")?.children ?? [])
    .filter(({ category_id, parent_id }) => published.has(category_id) && published.has(parent_id))
  const extraParents = new Map<string, string[]>()
  for (const { category_id, parent_id } of shortcuts) extraParents.set(category_id, [...(extraParents.get(category_id) ?? []), parent_id])

  res.setHeader("Cache-Control", "no-store")
  res.json({
    currency: profile.currency_code,
    scope: profile.scope,
    profile,
    product_types: profile.product_types,
    definitions: definitions.filter(isLibraryDefinition).map(({ code, label, aliases, position, role, filter_control, choice_colors }) => ({
      code, label, aliases, filterable: true, position, role, filter_control,
      ...(role === "color" && choice_colors ? { choice_colors } : {}),
    })),
    categories: data
      .filter((category) => published.has(category.id))
      .map((category) => ({
        id: category.id,
        handle: category.handle,
        name: category.name,
        parent_id: category.parent_category_id ?? null,
        ...(extraParents.has(category.id) ? { additional_parent_ids: extraParents.get(category.id) } : {}),
        kind: category.metadata?.catalog_kind ?? null,
        seo: publicCategorySeo(category.metadata?.catalog_seo),
        filter_codes: category.metadata?.catalog_filters_from_profile === true
          ? profile.product_types.find((type) => type.enabled && type.code === category.metadata?.catalog_kind)?.filter_codes ?? []
          : category.metadata?.catalog_filter_codes ?? null,
        ...(Array.isArray(category.metadata?.catalog_filter_disabled_codes) && category.metadata.catalog_filter_disabled_codes.length
          ? { filter_disabled_codes: category.metadata.catalog_filter_disabled_codes }
          : {}),
        position: category.metadata?.catalog_position ?? null,
      })),
  })
}
