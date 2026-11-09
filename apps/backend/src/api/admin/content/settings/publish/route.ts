import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { contentWorkflow } from "../../../../../workflows/content"
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await contentWorkflow(req.scope).run({ input: { operation: "settings-publish", actor_id: req.auth_context.actor_id } })
  res.json(result)
}
