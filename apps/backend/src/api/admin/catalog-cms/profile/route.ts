import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CATALOG_ATTRIBUTES_MODULE } from "../../../../modules/catalog-attributes"
import CatalogAttributesModuleService from "../../../../modules/catalog-attributes/service"
import { CatalogProfileBody } from "../validators"
import { saveCatalogProfileWorkflow } from "../../../../workflows/catalog-cms"
import { constructorProductTypes } from "../../../../lib/catalog-variation-library"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const [profile] = await service.listCatalogProfiles({ key: "store" })
  const { data: regions } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "region", fields: ["id", "name", "currency_code", "countries.iso_2"], pagination: { take: 100 } })
  res.json({ profile: profile ? { ...profile, product_types: constructorProductTypes(profile.product_types) } : null, regions })
}

export async function POST(req: AuthenticatedMedusaRequest<CatalogProfileBody>, res: MedusaResponse) {
  const { result } = await saveCatalogProfileWorkflow(req.scope).run({ input: { data: req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.json({ ...result, profile: { ...result.profile, product_types: constructorProductTypes(result.profile.product_types) } })
}
