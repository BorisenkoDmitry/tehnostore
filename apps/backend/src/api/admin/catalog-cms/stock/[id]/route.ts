import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CatalogStockBody } from "../../validators"
import { confirmCatalogStockWorkflow } from "../../../../../workflows/catalog-cms"

export async function POST(req: AuthenticatedMedusaRequest<CatalogStockBody>, res: MedusaResponse) {
  const { result } = await confirmCatalogStockWorkflow(req.scope).run({ input: { id: req.params.id, data: req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
