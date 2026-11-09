import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteCatalogDefinitionWorkflow } from "../../../../../workflows/catalog-cms"

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await deleteCatalogDefinitionWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json(result)
}
