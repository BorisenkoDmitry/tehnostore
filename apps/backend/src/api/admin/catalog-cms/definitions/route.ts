import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CATALOG_ATTRIBUTES_MODULE } from "../../../../modules/catalog-attributes"
import CatalogAttributesModuleService from "../../../../modules/catalog-attributes/service"
import { saveCatalogDefinitionWorkflow } from "../../../../workflows/catalog-cms"
import { CatalogDefinitionBody } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const definitions = await service.listCatalogDefinitions({}, { take: 1000, order: { position: "ASC", label: "ASC" } })
  res.json({ definitions })
}

export async function POST(req: AuthenticatedMedusaRequest<CatalogDefinitionBody>, res: MedusaResponse) {
  const { result } = await saveCatalogDefinitionWorkflow(req.scope).run({ input: { data: req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
