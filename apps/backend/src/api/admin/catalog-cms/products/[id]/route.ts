import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { CatalogProductBody } from "../../validators"
import { saveCatalogProductWorkflow } from "../../../../../workflows/catalog-cms"
import { CATALOG_ATTRIBUTES_MODULE } from "../../../../../modules/catalog-attributes"
import CatalogAttributesModuleService from "../../../../../modules/catalog-attributes/service"
import { getCatalogProfile } from "../../../../../lib/catalog-cms"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const profile = await getCatalogProfile(req.scope)
  const { data } = await query.graph({ entity: "product", fields: ["id", "title", "status", "metadata", "categories.id", "catalog_record.id", "catalog_record.attributes", "variants.id", "variants.title", "variants.metadata", "variants.catalog_variant.attributes", "variants.inventory_items.inventory_item_id", "options.id", "options.title", "variants.options.option_id", "variants.options.value"], filters: { id: req.params.id } })
  if (!data[0]) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Товар не найден")
  const service = req.scope.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const [definitions, changes, categories, locations] = await Promise.all([
    service.listCatalogDefinitions({}, { take: 1000, order: { position: "ASC", label: "ASC" } }),
    service.listCatalogChanges({ product_id: req.params.id }, { take: 30, order: { created_at: "DESC" } }),
    query.graph({ entity: "product_category", fields: ["id", "name", "handle", "parent_category_id", "metadata"], filters: { is_active: true, is_internal: false }, pagination: { take: 1000 } }),
    query.graph({ entity: "stock_location", fields: ["id", "name"], pagination: { take: 100 } }),
  ])
  res.setHeader("Cache-Control", "no-store")
  res.json({ product: data[0], definitions, changes, profile, product_types: profile.product_types, categories: categories.data.filter((category) => category.metadata?.catalog_scope === profile.scope), locations: locations.data })
}

export async function POST(req: AuthenticatedMedusaRequest<CatalogProductBody>, res: MedusaResponse) {
  const { result } = await saveCatalogProductWorkflow(req.scope).run({ input: { id: req.params.id, data: req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
