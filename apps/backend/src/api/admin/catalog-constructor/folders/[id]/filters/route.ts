import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { readConstructor } from "../../../../../../lib/catalog-constructor"
import { CATALOG_ATTRIBUTES_MODULE } from "../../../../../../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../../../../../../modules/catalog-attributes/service"
import { canonicalCatalogToken } from "../../../../../../search/helpers/catalog-filter-values"
import { isLibraryDefinition } from "../../../../../../lib/catalog-variation-library"
import { catalogBranchIds, categoryShortcuts } from "../../../../../../lib/catalog-hierarchy"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { categories, visible, profile, menu } = await readConstructor(req.scope)
  const root = categories.find((category) => category.id === req.params.id)
  if (!root) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Категория не найдена")
  const published = categories.filter(({ id }) => visible.has(id))
  const shortcuts = categoryShortcuts(menu?.children ?? []).filter(({ category_id, parent_id }) => visible.has(category_id) && visible.has(parent_id))
  const descendants = catalogBranchIds(published, shortcuts, root.id)
  const handles = published.filter(({ id }) => descendants.has(id)).map(({ handle }) => handle)
  if (!handles.length) { res.json({ codes: [], effective_enabled_codes: [], default_enabled_codes: [] }); return }
  const [{ search_result }, definitions] = await Promise.all([
    req.scope.resolve(ContainerRegistrationKeys.QUERY).search({
      entity: "product", fields: ["id"], pagination: { take: 0 },
      filters: { status: "published", catalog_scope: profile.scope, category_handles: handles },
      search_options: { count: "none", facets: [{ field: "option_values", limit: 5000 }] },
    }),
    req.scope.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).listCatalogDefinitions({ enabled: true, public: true }, { take: 1000 }),
  ])
  const facet = search_result.facets?.option_values as { values?: { value: string }[] } | undefined
  const names = new Set((facet?.values ?? []).map(({ value }) => canonicalCatalogToken(value.split(":", 1)[0])))
  const codes = definitions.filter((definition) => isLibraryDefinition(definition) &&
    [definition.label, ...definition.aliases].some((name) => names.has(canonicalCatalogToken(name)))).map(({ code }) => code)
  const defaultCodes = root.metadata?.catalog_filters_from_profile === true
    ? profile.product_types.find((type) => type.enabled && type.code === root.metadata?.catalog_kind)?.filter_codes ?? []
    : root.metadata?.catalog_filter_codes
  const defaults = Array.isArray(defaultCodes) ? codes.filter((code) => defaultCodes.includes(code)) : codes
  const disabled = Array.isArray(root.metadata?.catalog_filter_disabled_codes) ? root.metadata.catalog_filter_disabled_codes : []
  res.json({ codes, default_enabled_codes: defaults, effective_enabled_codes: defaults.filter((code) => !disabled.includes(code)) })
}
