import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { saveConstructorFolderWorkflow } from "../../../../workflows/catalog-constructor-graph"
import type { FolderBody } from "../validators"

export async function POST(req: AuthenticatedMedusaRequest<FolderBody>, res: MedusaResponse) {
  const { result } = await saveConstructorFolderWorkflow(req.scope).run({ input: req.validatedBody })
  res.json(result)
}
